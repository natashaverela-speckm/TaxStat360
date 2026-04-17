import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './Landing';
import Onboarding from './Onboarding';
import EntityCalculatorHybrid from './EntityCalculatorHybrid';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Onboarding />} />
        <Route path="/signin" element={<Onboarding />} />
        <Route path="/login" element={<Onboarding />} />
        <Route path="/calculate-tax" element={<EntityCalculatorHybrid />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
