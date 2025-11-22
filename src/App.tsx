// import React from 'react'
import { AppProvider } from '@/store/AppProvider'
import MainLayout from '@/components/layout/MainLayout'
import Header from '@/components/layout/Header'
import './App.css'

function App() {
  return (
    <AppProvider>
      <div className="app">
        <Header />
        <MainLayout />
      </div>
    </AppProvider>
  )
}

export default App