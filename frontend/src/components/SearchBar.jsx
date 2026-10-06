import React from 'react';

function SearchBar({ onSearch, placeholder = "Buscar produtos..." }) {
  return (
    <div className="search-container">
      <input
        type="text"
        placeholder={placeholder}
        className="search-input"
        onChange={(e) => onSearch(e.target.value)}
      />
      <span className="search-icon">🔍</span>
    </div>
  );
}

export default SearchBar;