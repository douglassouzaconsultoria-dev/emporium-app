import React, { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import './BannerCarousel.css';

// 🖼️ Banners de promoção no topo da vitrine (o admin liga/desliga em Admin → Imagens)
function BannerCarousel({ onOpen }) {
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/settings/banners`)
      .then(res => (res.ok ? res.json() : { enabled: false, items: [] }))
      .then(data => setItems(data.enabled ? data.items || [] : []))
      .catch(() => setItems([]));
  }, []);

  // Passa sozinho a cada 5 segundos
  useEffect(() => {
    if (items.length < 2) return undefined;
    const timer = setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const next = (Math.round(track.scrollLeft / track.clientWidth) + 1) % items.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
    }, 5000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  const onScroll = () => {
    const track = trackRef.current;
    if (track) setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <div className="bnr">
      <div className="bnr-track" ref={trackRef} onScroll={onScroll}>
        {items.map((b, i) => (
          <button
            key={i}
            type="button"
            className="bnr-slide"
            onClick={() => b.link_type !== 'none' && onOpen(b)}
            style={{ cursor: b.link_type !== 'none' ? 'pointer' : 'default' }}
          >
            <img src={b.image_url} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <div className="bnr-dots">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Banner ${i + 1}`}
              className={i === index ? 'active' : ''}
              onClick={() => trackRef.current.scrollTo({ left: i * trackRef.current.clientWidth, behavior: 'smooth' })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default BannerCarousel;
