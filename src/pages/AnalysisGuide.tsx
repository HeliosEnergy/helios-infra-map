import React from 'react';
import Layout from '../components/Layout';
import './AnalysisGuide.css';

const AnalysisGuide: React.FC = () => {
  return (
    <Layout>
      <div className="analysis-guide-container">
        <h1 className="guide-title">Analyst's Guide to Power Insights</h1>
        <p className="guide-intro">
          This guide explains the methodology and strategic value of each visualization on the dashboard. Use these insights to identify optimal power partners for our data center developments.
        </p>

        <div className="guide-section">
          <h2 className="section-title">Power Reliability Scoring</h2>
          <p className="section-objective">
            <strong>Objective:</strong> To perform a first-pass screening of power plants to identify the most reliable partners for ensuring data center uptime.
          </p>
          <p className="section-methodology">
            <strong>Methodology:</strong> A composite score is calculated on a 100-point scale. The score prioritizes factors critical to data center operations:
            <ul>
              <li><strong>Baseload Power:</strong> Nuclear, Hydro, and Gas plants receive a significant score increase due to their high reliability and predictable output.</li>
              <li><strong>Operational Status:</strong> Actively operating plants are scored higher than those that are planned or retired.</li>
              <li><strong>Scale:</strong> Larger plants (&gt;500MW) receive a bonus, as they often represent more stable, grid-critical infrastructure.</li>
            </ul>
          </p>
          <p className="section-usage">
            <strong>How to Use It:</strong> Use this chart to quickly identify a shortlist of top-tier candidates in a region. A high score indicates a technologically suitable and operationally ready partner.
          </p>
        </div>

        <div className="guide-section">
          <h2 className="section-title">Excess Capacity Analysis</h2>
          <p className="section-objective">
            <strong>Objective:</strong> To identify power plants with significant available capacity, indicating potential for scalable, long-term partnerships.
          </p>
          <p className="section-methodology">
            <strong>Methodology:</strong> This analysis calculates the available, unused power from a plant based on a conservative 80% utilization assumption. It filters for plants with over 50MW of this 'excess' capacity.
            <br />
            <em>Calculation: Excess Capacity = Total Capacity - (Total Capacity * 0.80)</em>
          </p>
          <p className="section-usage">
            <strong>How to Use It:</strong> Focus on plants at the top of this list when planning for future data center expansions. A partner with high excess capacity can grow with our power demands, reducing future site selection and interconnection costs.
          </p>
        </div>

        <div className="guide-section">
          <h2 className="section-title">Technology Landscape (Formerly Technology Efficiency)</h2>
          <p className="section-objective">
            <strong>Objective:</strong> To understand the scale and prevalence of different power generation technologies.
          </p>
          <p className="section-methodology">
            <strong>Methodology:</strong> This chart displays the average plant size (in MW) for each major technology type. It provides a proxy for the typical scale of deployment for a given energy source.
          </p>
          <p className="section-usage">
            <strong>How to Use It:</strong> Use this to gauge the maturity and scale of different technologies in the market. A high average capacity for a technology (e.g., Nuclear) indicates large, centralized deployments, while a lower average capacity (e.g., Solar) may indicate more distributed, smaller-scale facilities.
          </p>
        </div>

        <div className="guide-section">
          <h2 className="section-title">Regional Capacity Analysis</h2>
          <p className="section-objective">
            <strong>Objective:</strong> To identify which states and provinces have the highest concentration of power generation capacity.
          </p>
          <p className="section-usage">
            <strong>How to Use It:</strong> Target regions with high aggregate capacity for site selection. These areas are more likely to have robust grid infrastructure and a competitive energy market.
          </p>
        </div>

        <div className="guide-section">
          <h2 className="section-title">Total Capacity by Technology</h2>
          <p className="section-objective">
            <strong>Objective:</strong> To understand the composition of the overall power grid by technology type.
          </p>
          <p className="section-methodology">
            <strong>Methodology:</strong> This chart aggregates the total installed capacity (MW) for each power source, showing the market share of each technology.
          </p>
          <p className="section-usage">
            <strong>How to Use It:</strong> Assess grid-level risks and dependencies. A heavy reliance on a single technology (e.g., Gas) may expose a region to fuel price volatility. A diverse technology mix often indicates a more resilient grid.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default AnalysisGuide;