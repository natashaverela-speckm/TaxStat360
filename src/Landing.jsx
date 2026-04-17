import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

const Landing = () => {
  const testimonials = [
    { text: "TaxStat360 helped me keep an extra $47,000 in working capital this year by showing me exactly when to make strategic moves. My cash flow has never been stronger.", author: "Sarah Chen", title: "S-Corp Owner, Marketing Agency" },
    { text: "Real-time tax visibility changed everything. Instead of scrambling at year-end, I make informed decisions monthly that compound my wealth over time.", author: "Marcus Rodriguez", title: "Multi-Entity Real Estate Investor" },
    { text: "I can see exactly how each business decision impacts my tax liability before I make it. That is true wealth preservation.", author: "Jennifer Walsh", title: "Partnership Owner, Consulting Firm" }
  ];

  const entityTypes = [
    { icon: "🏢", title: "S-Corporations", badge: "K-1", description: "Officer W-2 salary, K-1 generation, and distributions all flow correctly to your personal 1040." },
    { icon: "🤝", title: "Partnerships and Multi-Member LLCs", badge: "K-1", description: "Each partners distributive share calculated separately. K-1 flows directly into your personal tax return." },
    { icon: "💻", title: "Sole Proprietors and Freelancers", badge: "Sch C", description: "Net profit hits Schedule C. SE tax, QBI deduction, and your real bottom line calculated instantly." },
    { icon: "🏦", title: "C-Corporations", badge: "Corp", description: "21% flat rate entity-level calculation. Understand after-tax profit and quarterly payment schedule." },
    { icon: "💼", title: "W-2 Plus Business Owner", badge: "Combined", description: "Have a day job and a business? We combine all income sources for your complete tax picture." },
    { icon: "🏗️", title: "Multiple Entities", badge: "Multi", description: "Run multiple businesses? Connect each accounting system and see your consolidated tax exposure." }
  ];

  const features = [
    { icon: "🚨", title: "Real-Time Risk Alerts" },
    { icon: "🎯", title: "What-If Simulator" },
    { icon: "💡", title: "Tax-Saving Discovery" },
    { icon: "📋", title: "K-1 Auto-Generation" },
    { icon: "🛡️", title: "Audit Defense AI" },
    { icon: "📊", title: "Compliance Score" },
    { icon: "📈", title: "Year-Over-Year Intel" },
    { icon: "🏢", title: "Multi-Entity View" }
  ];

  const steps = [
    { number: "01", title: "Connect your software", description: "Link QuickBooks, Xero, Wave, or FreshBooks. We pull your income and expense totals — no sub-accounts, just the numbers that matter." },
    { number: "02", title: "Enter your personal info", description: "Filing status, any W-2 income, dependents. For K-1 entities we auto-apply your ownership percentage and flow income to your 1040." },
    { number: "03", title: "See your real tax bill", description: "Complete tax liability, quarterly payments, QBI deduction savings, and K-1 breakdown — updated in real time as you adjust numbers." }
  ];

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="container">
          <div className="header-content">
            <div className="logo-section">
              <div style={{width:40,height:40,borderRadius:10,background:"#0D1B3E",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" opacity="0.6"/><rect x="10" y="7" width="4" height="14" fill="white" opacity="0.8"/><rect x="17" y="3" width="4" height="18" fill="white"/></svg></div>
              <div className="logo-text">
                <span className="logo-name">TaxStat360</span>
                <span className="logo-tagline">STRATEGIC · REAL-TIME · WEALTH-FOCUSED</span>
              </div>
            </div>
            <nav className="header-nav">
              <Link to="/login" className="btn btn-secondary">Sign In</Link>
              <Link to="/signup" className="btn btn-primary">Start Free Trial</Link>
            </nav>
          </div>
        </div>
      </header>

      <section className="hero-section">
        <div className="container">
          <div className="hero-content">
            <div className="hero-badge">✅ GET IN FRONT OF YOUR LARGEST EXPENSE</div>
            <h1 className="hero-title">Build Wealth by Managing Tax<br/>Liability in Real Time.</h1>
            <p className="hero-subtitle">Most business owners discover their tax liability at year-end when it is too late to optimize. TaxStat360 shows you exactly what you owe every month, so you can make strategic moves that preserve capital and accelerate wealth building.</p>
            <div className="hero-cta">
              <Link to="/signup" className="btn btn-primary btn-large">Start Free 7-Day Trial</Link>
              <Link to="/login" className="btn btn-secondary btn-large">Already have an account</Link>
            </div>
            <p className="hero-disclaimer">No charge until after 7-day trial · Cancel anytime · No CPA required</p>
            <div className="integrations">
              <span className="integrations-label">Connects with</span>
              <div className="integration-logos">
                <div className="integration-item"><div className="integration-icon qb">QB</div><span>QuickBooks</span></div>
                <div className="integration-item"><div className="integration-icon xero">X</div><span>Xero</span></div>
                <div className="integration-item"><div className="integration-icon wave">W</div><span>Wave</span></div>
                <div className="integration-item"><div className="integration-icon fresh">FB</div><span>FreshBooks</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="video-section">
        <div className="container">
          <div className="video-content">
            <h2 className="section-title white">See Strategic Tax Management in Action</h2>
            <p className="section-subtitle white">Watch how successful business owners use real-time tax intelligence to make wealth-building decisions every month</p>
            <div style={{maxWidth:800,margin:'0 auto',aspectRatio:'16/9',background:'rgba(0,0,0,0.2)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
              <div className="play-button">▶</div>
            </div>
          </div>
        </div>
      </section>

      <section className="credibility-section">
        <div className="container">
          <div className="credibility-content">
            <div className="credibility-icon">🏛️</div>
            <h2 className="section-title">Built by a Former IRS Revenue Agent</h2>
            <p className="credibility-text">TaxStat360 was developed by someone who spent years inside the IRS, understanding exactly what triggers audits and how to stay compliant. This is not just tax software — it is insider knowledge transformed into AI-powered protection for your business.</p>
            <div className="credibility-cta"><span className="btn btn-outline">✅ IRS-Approved Methodology</span></div>
          </div>
        </div>
      </section>

      <section className="entity-section">
        <div className="container">
          <h2 className="section-title">Built to Build Wealth — No Matter Your Entity Structure</h2>
          <p className="section-subtitle">S-Corp, LLC, Partnership, Sole Prop — every structure has legal strategies to reduce what you owe. TaxStat360 knows them all.</p>
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

      <section className="results-section">
        <div className="container">
          <h2 className="section-title">Real Wealth-Building Results from Strategic Tax Management</h2>
          <p className="section-subtitle">See how business owners use real-time tax intelligence to preserve capital and accelerate growth</p>
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="stars">★★★★★</div>
                <p className="testimonial-text">"{testimonial.text}"</p>
                <div className="testimonial-author">
                  <strong>{testimonial.author}</strong>
                  <span>{testimonial.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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

      <section className="pricing-section">
        <div className="container">
          <h2 className="section-title">Simple, transparent pricing</h2>
          <p className="section-subtitle">7-day free trial on all plans · No charge until trial ends · Cancel anytime</p>
          <div className="pricing-grid">
            <div className="pricing-card">
              <div className="pricing-header">
                <div className="pricing-label">GET STARTED</div>
                <div className="pricing-name">Starter</div>
                <div className="pricing-price">$79<span>/mo</span></div>
                <div className="pricing-description">Everything you need to know what you owe right now.</div>
              </div>
              <Link to="/signup" className="btn btn-primary" style={{width:"100%",marginBottom:"1rem",display:"block",textAlign:"center"}}>Start Free Trial</Link>
              <ul className="pricing-features">
                <li>✅ Real-time tax liability calculator</li>
                <li>✅ K-1 generation (S-Corps, partnerships, LLCs)</li>
                <li>✅ Schedule C (sole props and SMLLCs)</li>
                <li>✅ Entity-level tax calculation</li>
                <li>✅ Quarterly estimated payment planner</li>
              </ul>
            </div>
            <div className="pricing-card featured">
              <div className="pricing-badge">✅ MOST POPULAR</div>
              <div className="pricing-header">
                <div className="pricing-label">MOST POPULAR</div>
                <div className="pricing-name">Professional</div>
                <div className="pricing-price">$149<span>/mo</span></div>
                <div className="pricing-description">AI that watches your numbers and flags problems before they cost you.</div>
              </div>
              <Link to="/signup" className="btn btn-primary" style={{width:"100%",marginBottom:"1rem",display:"block",textAlign:"center"}}>Start Free Trial</Link>
              <div className="pricing-includes">→ Everything in Starter plus:</div>
              <ul className="pricing-features">
                <li>✅ Real-Time Risk Alert Engine</li>
                <li>✅ Explainable AI: Why This Number?</li>
                <li>✅ AI Assumption Transparency Panel</li>
                <li>✅ Financial Data Anomaly Detection</li>
              </ul>
            </div>
            <div className="pricing-card">
              <div className="pricing-badge" style={{background:"#1e3a8a"}}>Full Platform</div>
              <div className="pricing-header">
                <div className="pricing-label">FULL IRS ARMOR</div>
                <div className="pricing-name">Advanced</div>
                <div className="pricing-price">$299<span>/mo</span></div>
                <div className="pricing-description">Multi-entity management, CPA collaboration, and full audit defense.</div>
              </div>
              <Link to="/signup" className="btn btn-primary" style={{width:"100%",marginBottom:"1rem",display:"block",textAlign:"center"}}>Start Free Trial</Link>
              <div className="pricing-includes">→ Everything in Professional plus:</div>
              <ul className="pricing-features">
                <li>✅ What-If Scenario Simulator</li>
                <li>✅ Risk Tolerance Profiling</li>
                <li>✅ Industry Benchmark Intelligence</li>
                <li>✅ AI Recommendation Change Tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="container">
          <div className="features-content">
            <div>
              <span className="features-label">32 AI-POWERED FEATURES</span>
              <h2 className="section-title white">More than a calculator. A proactive tax intelligence engine.</h2>
              <p className="section-subtitle white">TaxStat360 watches your financials year-round — flagging audit risks, finding deductions you are missing, and keeping you ahead of IRS deadlines.</p>
              <Link to="/signup" className="btn btn-outline" style={{color:"white",borderColor:"white"}}>Explore All Features</Link>
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

      <section className="faq-section">
        <div className="container">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <p className="section-subtitle">Everything you need to know about TaxStat360 and real-time tax management</p>
          <div className="faq-grid">
            <div className="faq-item"><h3 className="faq-question">How accurate are the tax calculations?</h3><p className="faq-answer">TaxStat360 uses IRS-approved methodologies developed by a former IRS Revenue Agent. Our calculations include all current tax rates, deductions, and credits updated immediately when tax laws change.</p></div>
            <div className="faq-item"><h3 className="faq-question">Which accounting software do you integrate with?</h3><p className="faq-answer">We currently integrate with QuickBooks, Xero, Wave, and FreshBooks. We pull your income and expense totals automatically — no manual data entry required.</p></div>
            <div className="faq-item"><h3 className="faq-question">Do I still need my CPA or tax preparer?</h3><p className="faq-answer">TaxStat360 complements your tax professional, it does not replace them. We handle real-time monitoring and strategic planning throughout the year while your CPA focuses on final preparation.</p></div>
            <div className="faq-item"><h3 className="faq-question">How quickly can I see my tax liability?</h3><p className="faq-answer">Once you connect your accounting software and enter your personal info, you will see your complete tax picture in under 5 minutes. Updates happen in real-time as your financial data changes.</p></div>
            <div className="faq-item"><h3 className="faq-question">Is my financial data secure?</h3><p className="faq-answer">Yes. We use bank-level encryption and never store your login credentials. We only read your income and expense totals through secure, read-only API connections encrypted both in transit and at rest.</p></div>
            <div className="faq-item"><h3 className="faq-question">What if I have multiple business entities?</h3><p className="faq-answer">Our Advanced plan supports multiple entities with consolidated reporting. Connect different accounting systems for each business and see your combined tax exposure across all entities.</p></div>
            <div className="faq-item"><h3 className="faq-question">Can I cancel anytime?</h3><p className="faq-answer">Absolutely. All plans include a 7-day free trial with no commitment. After that, cancel anytime with just one click. No contracts, no hidden fees, no questions asked.</p></div>
            <div className="faq-item"><h3 className="faq-question">What makes this different from TurboTax or H&R Block?</h3><p className="faq-answer">Those are year-end filing tools. TaxStat360 is a real-time tax intelligence platform showing you exactly what you owe every month so you can make strategic decisions to minimize your liability all year long.</p></div>
          </div>
        </div>
      </section>

      <section className="footer-cta">
        <div className="container">
          <div className="cta-content">
            <Link to="/signup" className="btn btn-primary btn-large">✅ Start Your 7-Day Free Trial</Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
