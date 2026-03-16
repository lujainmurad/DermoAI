// ── NearbyMap.jsx ─────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import Nav from '../../components/Nav';

const NAV_LINKS = [
  { label: 'Home', path: '/patient' },
  { label: 'Book', path: '/patient/book' },
];

export function NearbyMap() {
  const mapRef     = useRef(null);
  const [status, setStatus] = useState('Loading map…');
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('Geolocation not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setStatus('Finding nearby clinics…');

        const apiKey = process.env.REACT_APP_GOOGLE_MAPS_KEY;

        if (!apiKey) {
          // Fallback — show static list without real map
          setStatus('');
          setPlaces([
            { name: 'City Dermatology Clinic',  vicinity: 'Near your location', rating: 4.5 },
            { name: 'Skin Health Centre',         vicinity: 'Near your location', rating: 4.2 },
            { name: 'University Medical Centre',  vicinity: 'Near your location', rating: 4.7 },
          ]);
          return;
        }

        try {
          const { Loader } = await import('@googlemaps/js-api-loader');
          const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places'] });
          const google = await loader.load();

          const map = new google.maps.Map(mapRef.current, {
            center: { lat, lng },
            zoom: 14,
            styles: darkMapStyle,
          });

          // User marker
          new google.maps.Marker({
            position: { lat, lng },
            map,
            title: 'You',
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8,
                    fillColor: '#00d4aa', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
          });

          // Places search
          const service = new google.maps.places.PlacesService(map);
          service.nearbySearch(
            { location: { lat, lng }, radius: 5000, type: 'doctor',
              keyword: 'dermatology skin clinic' },
            (results, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK) {
                setPlaces(results.slice(0, 8));
                results.slice(0, 8).forEach(place => {
                  new google.maps.Marker({
                    position: place.geometry.location,
                    map,
                    title: place.name,
                  });
                });
              }
              setStatus('');
            }
          );
        } catch (e) {
          setStatus('Map failed to load. Check your Google Maps API key.');
        }
      },
      () => setStatus('Location access denied. Please enable location permissions.')
    );
  }, []);

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="fade-up">
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Nearby dermatology clinics</h1>
          <p style={{ color: 'var(--text2)', marginBottom: 28, fontWeight: 300 }}>
            Clinics and hospitals with dermatology services near your location.
          </p>

          {/* Map */}
          <div style={{
            height: 360,
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--bg3)',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {status && (
              <div style={{ color: 'var(--text2)', fontSize: 14, zIndex: 1 }}>{status}</div>
            )}
            <div ref={mapRef} style={{ width: '100%', height: '100%', position: 'absolute' }} />
          </div>

          {/* Places list */}
          {places.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 16, marginBottom: 16 }}>Nearby results</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {places.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 0',
                    borderBottom: i < places.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 40, height: 40,
                      background: 'var(--teal-dim)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, flexShrink: 0,
                    }}>🏥</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                        {p.vicinity || 'Near your location'}
                      </div>
                    </div>
                    {p.rating && (
                      <span style={{
                        background: 'var(--amber-dim)',
                        color: 'var(--amber)',
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: 12,
                        fontWeight: 500,
                      }}>⭐ {p.rating}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!process.env.REACT_APP_GOOGLE_MAPS_KEY && (
            <div style={{
              marginTop: 16,
              background: 'var(--amber-dim)',
              border: '1px solid rgba(255,179,71,0.2)',
              borderRadius: 'var(--r-md)',
              padding: '12px 16px',
              fontSize: 13,
              color: 'var(--amber)',
            }}>
              ⚠️ Add REACT_APP_GOOGLE_MAPS_KEY to your .env to enable the live map.
              Get a free API key at console.cloud.google.com
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Dark map style
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1a2235' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aaac4' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#212d42' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1a2e' }] },
];

export default NearbyMap;
