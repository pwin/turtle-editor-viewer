// import React from 'react'
import logo from '@/assets/semantechsLogo.jpeg';
import './Header.css'

function Header() {
  return (
    <header className="app-header">
      <div className="logo-area">
        <img src={logo} alt="Semantechs Logo" className="app-logo" />
        <h1>Semantechs</h1>
      
      <span className="header-content">
        <span>RDF/Turtle Editor and Graph Visualizer</span>
        <button
          className="help-button"
          onClick={() => window.open('./user-guide.html', 'User Guide', 'width=1000,height=800,scrollbars=yes')}
          title="Open User Guide"
        >
          ?
        </button>
      </span>
      </div>
    </header>
  )
}

export default Header