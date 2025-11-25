import React from 'react';
import { Routes, Route } from 'react-router-dom';
import App from './App'; // This imports the default export, which is AppWrapper
import DataVisualizations from './components/DataVisualizations';
import AnalysisGuide from './pages/AnalysisGuide';
import PasswordGate from './components/PasswordGate';

const AppRouter: React.FC = () => {
  return (
    <PasswordGate>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/data-visualizations" element={<DataVisualizations />} />
        <Route path="/analysis-guide" element={<AnalysisGuide />} />
      </Routes>
    </PasswordGate>
  );
};

export default AppRouter;