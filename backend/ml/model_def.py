"""
model_def.py
------------
ResNetUNetV4 architecture — extracted from the inference script (Script 2)
as a clean, importable module with no Kaggle-specific paths or main() calls.

Usage:
    from ml.model_def import ResNetUNetV4
    model = ResNetUNetV4(pretrained=False)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models

# ImageNet normalisation constants (kept here so model is self-contained)
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]


# ---------------------------------------------------------------------------
# Internal building blocks
# ---------------------------------------------------------------------------

class ImageNetNorm(nn.Module):
    """Normalises a [0,1] float tensor to ImageNet mean/std in-place."""
    def __init__(self):
        super().__init__()
        self.register_buffer("mean", torch.tensor(IMAGENET_MEAN).view(1, 3, 1, 1))
        self.register_buffer("std",  torch.tensor(IMAGENET_STD ).view(1, 3, 1, 1))

    def forward(self, x):
        return (x - self.mean) / self.std


class ConvBlock(nn.Module):
    """Double 3×3 conv + BN + ReLU, with optional Dropout2d."""
    def __init__(self, in_ch: int, out_ch: int, drop: float = 0.0):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch,  out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
            nn.Dropout2d(drop) if drop > 0 else nn.Identity(),
        )

    def forward(self, x):
        return self.net(x)


class SEBlock(nn.Module):
    """Squeeze-and-Excitation channel attention."""
    def __init__(self, ch: int, r: int = 16):
        super().__init__()
        mid = max(ch // r, 4)
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool2d(1), nn.Flatten(),
            nn.Linear(ch, mid), nn.ReLU(inplace=True),
            nn.Linear(mid, ch), nn.Sigmoid(),
        )

    def forward(self, x):
        return x * self.fc(x).view(x.size(0), x.size(1), 1, 1)


class DualDilationASPP(nn.Module):
    """
    Two dilated pyramids fused into one bottleneck representation.
      Pyramid A – coarse: rates (6, 12, 18)
      Pyramid B – fine:   rates (3,  6,  9)
    Plus a 1×1 conv and a global-average-pool branch.
    """
    def __init__(self, in_ch: int, out_ch: int,
                 rates_a=(6, 12, 18), rates_b=(3, 6, 9), drop: float = 0.1):
        super().__init__()

        def _br(r):
            return nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 3, padding=r, dilation=r, bias=False),
                nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
            )

        self.b0 = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
        )
        self.branches_a = nn.ModuleList([_br(r) for r in rates_a])
        self.branches_b = nn.ModuleList([_br(r) for r in rates_b])
        self.gap = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(in_ch, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
        )
        n = 1 + len(rates_a) + len(rates_b) + 1
        self.project = nn.Sequential(
            nn.Conv2d(n * out_ch, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
            nn.Dropout2d(drop),
        )

    def forward(self, x):
        h, w  = x.shape[-2:]
        parts = ([self.b0(x)]
                 + [br(x) for br in self.branches_a]
                 + [br(x) for br in self.branches_b])
        parts.append(
            F.interpolate(self.gap(x), (h, w), mode="bilinear", align_corners=False)
        )
        return self.project(torch.cat(parts, dim=1))


class ChannelAttention(nn.Module):
    def __init__(self, ch: int, r: int = 16):
        super().__init__()
        mid = max(ch // r, 1)
        self.mlp = nn.Sequential(
            nn.Flatten(),
            nn.Linear(ch, mid), nn.ReLU(inplace=True),
            nn.Linear(mid, ch),
        )

    def forward(self, x):
        a = self.mlp(F.adaptive_avg_pool2d(x, 1))
        m = self.mlp(F.adaptive_max_pool2d(x, 1))
        return x * torch.sigmoid(a + m).view(x.size(0), x.size(1), 1, 1)


class SpatialAttentionCBAM(nn.Module):
    def __init__(self, ks: int = 7):
        super().__init__()
        self.conv = nn.Conv2d(2, 1, ks, padding=(ks - 1) // 2, bias=False)
        self.bn   = nn.BatchNorm2d(1)

    def forward(self, x):
        avg = x.mean(dim=1, keepdim=True)
        mx, _ = x.max(dim=1, keepdim=True)
        return x * torch.sigmoid(self.bn(self.conv(torch.cat([avg, mx], dim=1))))


class CBAM(nn.Module):
    """Convolutional Block Attention Module."""
    def __init__(self, ch: int):
        super().__init__()
        self.ca = ChannelAttention(ch)
        self.sa = SpatialAttentionCBAM()

    def forward(self, x):
        return self.sa(self.ca(x))


class UpBlock(nn.Module):
    """Decoder block: upsample + CBAM on skip + SE on output."""
    def __init__(self, in_ch: int, skip_ch: int, out_ch: int, drop: float = 0.1):
        super().__init__()
        self.up = nn.Sequential(
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(in_ch, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
        )
        self.cbam = CBAM(skip_ch)
        self.conv = ConvBlock(out_ch + skip_ch, out_ch, drop=drop)
        self.se   = SEBlock(out_ch)

    def forward(self, x, skip):
        g = self.up(x)
        if g.shape[-2:] != skip.shape[-2:]:
            g = F.interpolate(g, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        return self.se(self.conv(torch.cat([g, self.cbam(skip)], dim=1)))


# ---------------------------------------------------------------------------
# Full model
# ---------------------------------------------------------------------------

class ResNetUNetV4(nn.Module):
    """
    ResNet-50 encoder
    + ImageNet normalisation inside the model
    + Dual-Dilation ASPP bottleneck
    + CBAM on every skip connection
    + SE blocks in every decoder stage
    + Dropout2d in ASPP and decoder ConvBlocks

    In eval mode returns a single (B, 1, H, W) logit tensor.
    In train mode also returns two auxiliary heads (not used during inference).
    """

    def __init__(self, pretrained: bool = False, drop: float = 0.1):
        super().__init__()
        self.norm = ImageNetNorm()

        enc = models.resnet50(
            weights=models.ResNet50_Weights.DEFAULT if pretrained else None
        )
        # Encoder stages
        self.stem = nn.Sequential(enc.conv1, enc.bn1, enc.relu)  # /2   64ch
        self.pool = enc.maxpool                                   # /4   64ch
        self.e1   = enc.layer1   # /4   256ch
        self.e2   = enc.layer2   # /8   512ch
        self.e3   = enc.layer3   # /16 1024ch
        self.e4   = enc.layer4   # /32 2048ch

        # Bottleneck: reduce 2048 → 512 then ASPP
        self.bot_reduce = nn.Sequential(
            nn.Conv2d(2048, 512, 1, bias=False),
            nn.BatchNorm2d(512), nn.ReLU(inplace=True),
        )
        self.aspp     = DualDilationASPP(512, 512, drop=drop)
        self.cbam_bot = CBAM(512)

        # Decoder (skip channel sizes match ResNet-50 layer outputs)
        self.d1 = UpBlock(512, 1024, 256, drop=drop)
        self.d2 = UpBlock(256,  512, 128, drop=drop)
        self.d3 = UpBlock(128,  256,  64, drop=drop)
        self.d4 = UpBlock( 64,   64,  64, drop=drop)

        # Final head: upsample ×2 to original resolution
        self.final = nn.Sequential(
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            ConvBlock(64, 32, drop=0.0),
            nn.Conv2d(32, 1, 1),
        )

        # Auxiliary heads (used only during training)
        self.aux0 = nn.Conv2d(512, 1, 1)
        self.aux1 = nn.Conv2d(256, 1, 1)
        self.aux2 = nn.Conv2d(128, 1, 1)

    def forward(self, x):
        x  = self.norm(x)

        # Encoder
        s0 = self.stem(x)   # (B,   64, H/2,  W/2)
        p  = self.pool(s0)  # (B,   64, H/4,  W/4)
        s1 = self.e1(p)     # (B,  256, H/4,  W/4)
        s2 = self.e2(s1)    # (B,  512, H/8,  W/8)
        s3 = self.e3(s2)    # (B, 1024, H/16, W/16)
        s4 = self.e4(s3)    # (B, 2048, H/32, W/32)

        # Bottleneck
        b = self.cbam_bot(self.aspp(self.bot_reduce(s4)))

        # Decoder
        d1 = self.d1(b,  s3)
        d2 = self.d2(d1, s2)
        d3 = self.d3(d2, s1)
        d4 = self.d4(d3, s0)

        out = self.final(d4)   # (B, 1, H, W)

        if self.training:
            H, W = x.shape[-2:]
            aux0 = F.interpolate(self.aux0(b),  (H, W), mode="bilinear", align_corners=False)
            aux1 = F.interpolate(self.aux1(d1), (H, W), mode="bilinear", align_corners=False)
            aux2 = F.interpolate(self.aux2(d2), (H, W), mode="bilinear", align_corners=False)
            return out, aux0, aux1, aux2

        return out
