import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

// LOGO component - exact copy from Onboarding.jsx line 8
const LOGO = () => (
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <svg width="30" height="30" viewBox="0 0 34 34">
      <rect width="34" height="34" rx="8" fill="#0D1B3E"/>
      <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/>
      <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/>
      <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/>
      <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/>
    </svg>
    <div style={{fontWeight:800,color:'#0D1B3E',fontSize:17,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>
      TaxStat<span style={{color:'#2563EB'}}>360</span>
    </div>
  </div>
);

const Landing = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const testimonials = [
    {
      text: "TaxStat360 helped me keep an extra $47,000 in working capital this year by showing me exactly when to make strategic moves. My cash flow has never been stronger.",
      author: "Sarah Chen",
      title: "S-Corp Owner, Marketing Agency"
    },
    {
      text: "Real-time tax visibility changed everything. Instead of scrambling at year-end, I make informed decisions monthly that compound my wealth over time.",
      author: "Marcus Rodriguez",
      title: "Multi-Entity Real Estate Investor"
    },
    {
      text: "The strategic insights are incredible. I can see exactly how each business decision impacts my tax liability before I make it. That's true wealth preservation.",
      author: "Jennifer Walsh",
      title: "Partnership Owner, Consulting Firm"
    }
  ];

  const entityTypes = [
    {
      icon: "üè¢",
      title: "S-Corporations",
      badge: "K-1",
      description: "Officer W-2 salary, K-1 generation, and distributions all flow correctly to your personal 1040.",
    },
    {
      icon: "ü§ù",
      title: "Partnerships and Multi-Member LLCs",
      badge: "K-1",
      description: "Each partners distributive share calculated separately. K-1 flows directly into your personal tax return.",
    },
    {
      icon: "üìã",
      title: "Sole Proprietors and Freelancers",
      badge: "Sch C",
      description: "Net profit hits Schedule C. SE tax, QBI deduction, and your real bottom line calculated instantly.",
    },
    {
      icon: "üèóÔ∏è",
      title: "C-Corporations",
      badge: "Corp",
      description: "21% flat rate entity-level calculation. Understand after-tax profit and quarterly payment schedule.",
    },
    {
      icon: "üíº",
      title: "W-2 Plus Business Owner",
      badge: "Combined",
      description: "Have a day job and a business? We combine all income sources for your complete tax picture.",
    },
    {
      icon: "üìä",
      title: "Multiple Entities",
      badge: "Multi",
      description: "Run multiple businesses? Connect each accounting system and see your consolidated tax exposure.",
    }
  ];

  const features = [
    { icon: "üö®", title: "Real-Time Risk Alerts" },
    { icon: "üéØ", title: "What-If Simulator" },
    { icon: "üí°", title: "Tax-Saving Discovery" },
    { icon: "üìÑ", title: "K-1 Auto-Generation" },
    { icon: "üõ°Ô∏è", title: "Audit Defense AI" },
    { icon: "üìà", title: "Compliance Score" },
    { icon: "üìÖ", title: "Year-Over-Year Intel" },
    { icon: "üè¢", title: "Multi-Entity View" }
  ];

  const steps = [
    {
      number: "01",
      title: "Connect your software",
      description: "Link QuickBooks, Xero, Wave, or FreshBooks. We pull your income and expense totals ‚Äî no sub-accounts, just the numbers that matter."
    },
    {
      number: "02", 
      title: "Enter your personal info",
      description: "Filing status, any W-2 income, dependents. For K-1 entities we auto-apply your ownership percentage and flow income to your 1040."
    },
    {
      number: "03",
      title: "See your real tax bill",
      description: "Complete tax liability, quarterly payments, QBI deduction savings, and K-1 breakdown ‚Äî updated in real time as you adjust numbers."
    }
  ];

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="landing-header">
        <div className="container">
          <div className="header-content">
            <div className="logo-section">
              <LOGO />
            </div>
            <nav className="header-nav">
              <Link to="/signin" className="nav-link">Sign In</Link>
              <Link to="/trial" className="btn btn-primary">Start Free Trial</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className={`hero-section ${isVisible ? 'fade-in' : ''}`}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-badge">
              ‚ú® GET IN FRONT OF YOUR LARGEST EXPENSE
            </div>
            <h1 className="hero-title">
              Build Wealth by Managing Tax<br />
              Liability in Real Time.
            </h1>
            <p className="hero-subtitle">
              Most business owners discover their tax liability at year-end when it's 
              too late to optimize. TaxStat360 shows you exactly what you owe every 
              month, so you can make strategic moves that preserve capital and 
              accelerate wealth building.
            </p>
            <div className="hero-cta">
              <Link to="/trial" className="btn btn-primary btn-large">
                Start Free 7-Day Trial
              </Link>
              <Link to="/signin" className="btn btn-secondary">
                Already have an account
              </Link>
            </div>
            <div className="hero-disclaimer">
              No charge until after 7-day trial ‚Ä¢ Cancel anytime ‚Ä¢ No CPA required
            </div>
            <div className="integrations">
              <span className="integrations-label">Connects with</span>
              <div className="integration-logos">
                <div className="integration-item">
                  <span className="integration-icon qb">QB</span>
                  <span>QuickBooks</span>
                </div>
                <div className="integration-item">
                  <span className="integration-icon xero">X</span>
                  <span>Xero</span>
                </div>
                <div className="integration-item">
                  <span className="integration-icon wave">W</span>
                  <span>Wave</span>
                </div>
                <div className="integration-item">
                  <span className="integration-icon fresh">FB</span>
                  <span>FreshBooks</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Testimonial Section */}
      <section className="video-section">
        <div className="container">
          <div className="video-content">
            <h2 className="section-title white">
              See Strategic Tax Management in Action
            </h2>
            <p className="section-subtitle white">
              Watch how successful business owners use real-time tax intelligence to make wealth-building decisions every month
            </p>
            <div className="video-container">
              <div className="video-placeholder">
                <div className="play-button">‚ñ∂</div>
                <div className="video-overlay">
                  <span>Play Video</span>
                </div>
              </div>
              <div className="app-preview">
                <div className="preview-window">
                  <div className="preview-header">
                    <div className="preview-dots">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                  <div className="preview-content">
                    <div className="preview-title">Build Wealth by Managing Tax Liability in Real Time</div>
                    <div className="preview-chart">üìä</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility Section */}
      <section className="credibility-section">
        <div className="container">
          <div className="credibility-content">
            <div className="credibility-icon">üë§</div>
            <h2 className="section-title">Built by a Former IRS Revenue Agent</h2>
            <p className="credibility-text">
              TaxStat360 was developed by someone who spent years inside the IRS, understanding exactly what triggers audits and how to stay compliant. This isn't just tax software‚Äîit's insider knowledge transformed into AI-powered protection for your business.
            </p>
            <div className="credibility-cta">
              <span className="btn btn-primary">‚úì IRS-Approved Methodology</span>
            </div>
          </div>
        </div>
      </section>

      {/* Entity Types Section */}
      <section className="entity-section">
        <div className="container">
          <h2 className="section-title">
            Built to Build Wealth ‚Äî No Matter Your Entity Structure
          </h2>
          <p className="section-subtitle">
            S-Corp, LLC, Partnership, Sole Prop ‚Äî every structure has legal strategies to reduce what you owe. TaxStat360 knows them all.
          </p>
          <div className="entity-grid">
            {entityTypes.map((entity, index) => (
              <div key={index} className="entity-card">
                <div className="entity-header">
                  <span className="entity-icon">{entity.icon}</span>
                  <span className="entity-badge">{entity.badge}</span>
                </div>
                <h3 className="entity-title">{entity.title}</h3>
                <p className="entity-description">{entity.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="results-section">
        <div className="container">
          <h2 className="section-title">
            Real Wealth-Building Results from Strategic Tax Management
          </h2>
          <p className="section-subtitle">
            See how business owners use real-time tax intelligence to preserve capital and accelerate growth
          </p>
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="stars">‚≠ê‚≠ê‚≠ê‚≠ê‚≠ê</div>
                <blockquote className="testimonial-text">
                  "{testimonial.text}"
                </blockquote>
                <div className="testimonial-author">
                  <strong>{testimonial.author}</strong>
                  <span>{testimonial.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="process-section">
        <div className="container">
          <h2 className="section-title">Your tax bill in 3 steps</h2>
          <p className="section-subtitle">From connected to calculated in under 5 minutes</p>
          <div className="steps-container">
            {steps.map((step, index) => (
              <div key={index} className="step-card">
                <div className="step-number">{step.number}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-description">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing-section">
        <div className="container">
          <h2 className="section-title">Simple, transparent pricing</h2>
          <p className="section-subtitle">
            7-day free trial on all plans ‚Ä¢ No charge until trial ends ‚Ä¢ Cancel anytime
          </p>
          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="pricing-header">
                <span className="pricing-label">GET STARTED</span>
                <h3 className="pricing-name">Starter</h3>
                <div className="pricing-price">$79<span>/mo</span></div>
                <p className="pricing-description">Everything you need to know what you owe right now.</p>
              </div>
              <button className="btn btn-outline">Start Free Trial</button>
              <ul className="pricing-features">
                <li>‚úì Real-time tax liability calculator</li>
                <li>‚úì K-1 generation (S-Corps, partnerships, LLCs)</li>
                <li>‚úì Schedule C (sole props and SMLLCs)</li>
                <li>‚úì Entity-level tax calculation</li>
                <li>‚úì Quarterly estimated payment planner</li>
              </ul>
            </div>

            <div className="pricing-card featured">
              <div className="pricing-badge">‚ú® MOST POPULAR</div>
              <div className="pricing-header">
                <span className="pricing-label">MOST POPULAR</span>
                <h3 className="pricing-name">Professional</h3>
                <div className="pricing-price">$149<span>/mo</span></div>
                <p className="pricing-description">AI that watches your numbers and flags problems before they cost you.</p>
              </div>
              <button className="btn btn-primary">Start Free Trial</button>
              <div className="pricing-includes">
                <span>‚Üë Everything in Starter plus:</span>
              </div>
              <ul className="pricing-features">
                <li>‚úì Real-Time Risk Alert Engine</li>
                <li>‚úì Explainable AI: Why This Number?</li>
                <li>‚úì AI Assumption Transparency Panel</li>
                <li>‚úì Financial Data Anomaly Detection</li>
              </ul>
            </div>

            <div className="pricing-card">
              <div className="pricing-header">
                <span className="pricing-label">FULL IRS ARMOR</span>
                <h3 className="pricing-name">Advanced</h3>
                <div className="pricing-price">$299<span>/mo</span></div>
                <p className="pricing-description">Multi-entity management, CPA collaboration, and full audit defense.</p>
              </div>
              <button className="btn btn-outline">Start Free Trial</button>
              <div className="pricing-includes">
                <span>‚Üë Everything in Professional plus:</span>
              </div>
              <ul className="pricing-features">
                <li>‚úì What-If Scenario Simulator</li>
                <li>‚úì Risk Tolerance Profiling</li>
                <li>‚úì Industry Benchmark Intelligence</li>
                <li>‚úì AI Recommendation Change Tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container">
          <div className="features-content">
            <div className="features-text">
              <span className="features-label">32 AI-POWERED FEATURES</span>
              <h2 className="section-title white">
                More than a calculator. A<br />
                proactive tax intelligence engine.
              </h2>
              <p className="section-subtitle white">
                TaxStat360 watches your financials year-round ‚Äî flagging audit risks, 
                finding deductions you are missing, and keeping you ahead of IRS 
                deadlines. Built for US-specific IRS, state, and federal requirements.
              </p>
              <Link to="/features" className="btn btn-primary">
                Explore All Features
              </Link>
            </div>
            <div className="features-grid">
              {features.map((feature, index) => (
                <div key={index} className="feature-card">
                  <span className="feature-icon">{feature.icon}</span>
                  <span className="feature-title">{feature.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section">
        <div className="container">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <p className="section-subtitle">
            Everything you need to know about TaxStat360 and real-time tax management
          </p>
          <div className="faq-grid">
            <div className="faq-item">
              <h3 className="faq-question">How accurate are the tax calculations?</h3>
              <p className="faq-answer">
                TaxStat360 uses IRS-approved methodologies developed by a former IRS Revenue Agent. 
                Our calculations include all current tax rates, deductions, and credits. We update 
                our engine immediately when tax laws change to ensure 99.9% accuracy.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">Which accounting software do you integrate with?</h3>
              <p className="faq-answer">
                We currently integrate with QuickBooks, Xero, Wave, and FreshBooks. We pull your 
                income and expense totals automatically - no manual data entry required. More 
                integrations are coming soon.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">Do I still need my CPA or tax preparer?</h3>
              <p className="faq-answer">
                TaxStat360 complements your tax professional, it doesn't replace them. We handle 
                real-time monitoring and strategic planning throughout the year, while your CPA 
                can focus on complex strategies and final tax preparation.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">How quickly can I see my tax liability?</h3>
              <p className="faq-answer">
                Once you connect your accounting software and enter your personal info, you'll see 
                your complete tax picture in under 5 minutes. Updates happen in real-time as your 
                financial data changes.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">Is my financial data secure?</h3>
              <p className="faq-answer">
                Yes. We use bank-level encryption and never store your login credentials. We only 
                read your income and expense totals through secure, read-only API connections. 
                Your data is encrypted both in transit and at rest.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">What if I have multiple business entities?</h3>
              <p className="faq-answer">
                Our Advanced plan supports multiple entities with consolidated reporting. You can 
                connect different accounting systems for each business and see your combined tax 
                exposure across all entities.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">Can I cancel anytime?</h3>
              <p className="faq-answer">
                Absolutely. All plans include a 7-day free trial with no commitment. After that, 
                you can cancel anytime with just one click. No contracts, no hidden fees, no 
                questions asked.
              </p>
            </div>
            
            <div className="faq-item">
              <h3 className="faq-question">What makes this different from TurboTax or H&R Block?</h3>
              <p className="faq-answer">
                Those are tax preparation tools for year-end filing. TaxStat360 is a real-time 
                tax intelligence platform that shows you exactly what you owe every month, so you 
                can make strategic decisions throughout the year to minimize your liability.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="footer-cta">
        <div className="container">
          <div className="cta-content">
            <Link to="/trial" className="btn btn-primary btn-large">
              ‚úì 7-Day Free Trial
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;

