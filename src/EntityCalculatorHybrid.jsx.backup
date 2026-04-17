import React, { useState } from 'react';

const EntityCalculatorHybrid = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [entities, setEntities] = useState([
    { id: 1, name: 'Tech Consulting LLC', type: 's-corp', ein: '12-3456789', state: 'DE', active: true },
    { id: 2, name: 'Marketing Solutions Corp', type: 'llc', ein: '98-7654321', state: 'CA', active: true }
  ]);
  const [simpleEntities, setSimpleEntities] = useState([
    { id: 1, type: 'S-Corp', connected: false }
  ]);

  const addSimpleEntity = () => {
    setSimpleEntities(prev => [...prev, { 
      id: Date.now(), 
      type: 'S-Corp', 
      connected: false 
    }]);
  };

  const updateSimpleEntity = (id, field, value) => {
    setSimpleEntities(prev => 
      prev.map(entity => 
        entity.id === id ? { ...entity, [field]: value } : entity
      )
    );
  };

  const removeSimpleEntity = (id) => {
    if (simpleEntities.length > 1) {
      setSimpleEntities(prev => prev.filter(entity => entity.id !== id));
    }
  };

  if (showAdvanced) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', background: '#f8fafc', minHeight: '100vh' }}>
        <button 
          onClick={() => setShowAdvanced(false)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: 'white', 
            border: '1px solid #d1d5db', 
            color: '#374151', 
            padding: '0.75rem 1rem', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            marginBottom: '2rem',
            fontWeight: '500' 
          }}
        >
          ← Back to Simple Entity Setup
        </button>

        <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h1 style={{ color: '#1e3a8a', margin: '0 0 0.5rem 0', fontSize: '2rem', fontWeight: '700' }}>Advanced Entity Management</h1>
              <p style={{ color: '#64748b', margin: '0', fontSize: '1rem' }}>Comprehensive tools for complex business structures</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button style={{ 
                background: 'white', 
                border: '1px solid #d1d5db', 
                color: '#374151', 
                padding: '0.75rem 1.5rem', 
                borderRadius: '8px', 
                cursor: 'pointer',
                fontWeight: '500' 
              }}>
                📊 Import/Export
              </button>
              <button style={{ 
                background: '#2563eb', 
                color: 'white', 
                border: 'none', 
                padding: '0.75rem 1.5rem', 
                borderRadius: '8px', 
                cursor: 'pointer',
                fontWeight: '500'
              }}>
                + Add New Entity
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: '700', color: '#10b981', marginBottom: '0.5rem' }}>{entities.length}</span>
              <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>Total Entities</span>
            </div>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: '700', color: '#10b981', marginBottom: '0.5rem' }}>{entities.filter(e => e.active).length}</span>
              <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>Active</span>
            </div>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: '700', color: '#2563eb', marginBottom: '0.5rem' }}>2</span>
              <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>Complete</span>
            </div>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '2rem', fontWeight: '700', color: '#f59e0b', marginBottom: '0.5rem' }}>0</span>
              <span style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>Need Attention</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {entities.map(entity => (
              <div key={entity.id} style={{
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e2e8f0',
                transition: 'all 0.2s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', gap: '1rem' }}>
                  <div style={{ color: '#9ca3af', fontSize: '1.25rem', cursor: 'grab', padding: '0.5rem' }}>
                    ⋮⋮
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {entity.name}
                        {entity.active && <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500' }}>Active</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
                        <span style={{ fontWeight: '500', color: '#475569' }}>
                          {entity.type === 's-corp' ? 'S-Corporation' : 'LLC'}
                        </span>
                        {entity.ein && <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>EIN: {entity.ein}</span>}
                        <span>{entity.state}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: '600', color: '#1e3a8a' }}>100%</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ownership</span>
                      </div>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button style={{ padding: '0.5rem', border: 'none', background: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>✏️</button>
                    <button style={{ padding: '0.5rem', border: 'none', background: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>📋</button>
                    <button style={{ padding: '0.5rem', border: 'none', background: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                  </div>
                </div>
                <div style={{ padding: '0.75rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Last updated: {new Date().toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Navigation Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 1.5rem', 
        background: 'white', 
        borderRadius: '12px', 
        marginBottom: '2rem', 
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' 
      }}>
        <div style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '1.125rem' }}>
          TaxStat<span style={{ color: '#2563eb' }}>360</span>
        </div>
        <div style={{ 
          background: '#f1f5f9', 
          color: '#475569', 
          padding: '0.5rem 1rem', 
          borderRadius: '20px', 
          fontSize: '0.875rem', 
          fontWeight: 500 
        }}>
          Step 1 of 2 — Business
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button style={{ 
            padding: '0.5rem 1rem', 
            borderRadius: '8px', 
            fontWeight: 500, 
            fontSize: '0.875rem', 
            background: '#f8fafc', 
            border: '1px solid #d1d5db', 
            color: '#374151',
            cursor: 'pointer'
          }}>
            AI Analysis
          </button>
          <button style={{ 
            padding: '0.5rem 1rem', 
            borderRadius: '8px', 
            fontWeight: 500, 
            fontSize: '0.875rem', 
            background: '#f8fafc', 
            border: '1px solid #d1d5db', 
            color: '#374151',
            cursor: 'pointer'
          }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Page Header */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '2rem', 
        background: 'white', 
        padding: '2rem', 
        borderRadius: '12px', 
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' 
      }}>
        <h1 style={{ 
          color: '#1e3a8a', 
          fontSize: '2rem', 
          marginBottom: '0.5rem', 
          fontWeight: 700,
          margin: '0 0 0.5rem 0' 
        }}>
          Entity Calculator
        </h1>
        <p style={{ color: '#64748b', fontSize: '1rem', margin: '0' }}>
          Add all your business entities. Connect each to its accounting software or enter P&L manually.
        </p>
      </div>

      {/* Simple Entity Section */}
      <div style={{ 
        background: 'white', 
        padding: '2rem', 
        borderRadius: '12px', 
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)', 
        marginBottom: '1.5rem' 
      }}>
        {simpleEntities.map((entity, index) => (
          <div key={entity.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            marginBottom: '1rem',
            position: 'relative'
          }}>
            <span style={{ fontWeight: 600, color: '#1e293b', minWidth: '100px' }}>
              Business {index + 1}
            </span>
            
            <select 
              value={entity.type}
              onChange={(e) => updateSimpleEntity(entity.id, 'type', e.target.value)}
              style={{
                flex: 1,
                maxWidth: '200px',
                padding: '0.625rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: 'white',
                fontSize: '0.875rem'
              }}
            >
              <option>S-Corp</option>
              <option>LLC (Partnership)</option>
              <option>LLC (Single-Member)</option>
              <option>Sole Proprietorship</option>
              <option>C-Corp</option>
              <option>Partnership</option>
            </select>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.025em' }}>
                CONNECT ACCOUNTING SOFTWARE
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['Enter Manually', 'QuickBooks', 'Xero', 'Wave', 'FreshBooks'].map(software => (
                  <button
                    key={software}
                    onClick={() => updateSimpleEntity(entity.id, 'connected', software)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: entity.connected === software ? '#10b981' : 'white',
                      color: entity.connected === software ? 'white' : '#374151',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                  >
                    {software}{entity.connected === software ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </div>

            {simpleEntities.length > 1 && (
              <button 
                onClick={() => removeSimpleEntity(entity.id)}
                style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: '#f87171',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button 
          onClick={addSimpleEntity}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '1rem',
            border: '1px dashed #2563eb',
            borderRadius: '8px',
            background: '#eff6ff',
            color: '#2563eb',
            cursor: 'pointer',
            fontWeight: 500,
            width: '100%',
            transition: 'all 0.2s'
          }}
        >
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>+</span>
          Add Another Business Entity
        </button>
      </div>

      {/* Separator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        margin: '2rem 0',
        color: '#64748b',
        fontSize: '0.875rem',
        fontWeight: 500
      }}>
        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
        Need more advanced entity management?
        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
      </div>

      {/* Advanced Section */}
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        padding: '2rem',
        borderRadius: '12px',
        border: '2px solid #93c5fd',
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <h3 style={{ 
          color: '#1e40af', 
          fontSize: '1.5rem', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          margin: '0 0 0.5rem 0'
        }}>
          🚀 Advanced Entity Management
        </h3>
        <p style={{ color: '#3730a3', fontSize: '0.875rem', margin: '0 0 1.5rem 0' }}>
          Comprehensive tools for complex business structures
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem',
          margin: '1.5rem 0',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontSize: '0.8125rem', fontWeight: 500 }}>
            <span style={{ 
              width: '1rem', 
              height: '1rem', 
              background: '#2563eb', 
              color: 'white', 
              borderRadius: '3px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '0.625rem', 
              flexShrink: 0 
            }}>📝</span>
            Detailed entity forms (EIN, formation date, address)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontSize: '0.8125rem', fontWeight: 500 }}>
            <span style={{ 
              width: '1rem', 
              height: '1rem', 
              background: '#2563eb', 
              color: 'white', 
              borderRadius: '3px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '0.625rem', 
              flexShrink: 0 
            }}>🔄</span>
            Drag-and-drop entity organization
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontSize: '0.8125rem', fontWeight: 500 }}>
            <span style={{ 
              width: '1rem', 
              height: '1rem', 
              background: '#2563eb', 
              color: 'white', 
              borderRadius: '3px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '0.625rem', 
              flexShrink: 0 
            }}>📊</span>
            Bulk import/export from CSV
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontSize: '0.8125rem', fontWeight: 500 }}>
            <span style={{ 
              width: '1rem', 
              height: '1rem', 
              background: '#2563eb', 
              color: 'white', 
              borderRadius: '3px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '0.625rem', 
              flexShrink: 0 
            }}>🔍</span>
            Search and filter entities
          </div>
        </div>

        <button 
          onClick={() => setShowAdvanced(true)}
          style={{
            background: '#2563eb',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 500,
            marginTop: '1rem',
            transition: 'background 0.2s'
          }}
        >
          🚀 Open Advanced Entity Manager
        </button>
      </div>

      {/* Continue Section */}
      <div style={{
        textAlign: 'center',
        background: 'white',
        padding: '1.5rem',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {simpleEntities.filter(e => e.connected).length > 0 
            ? `${simpleEntities.filter(e => e.connected).length} entities connected`
            : 'Add your business entities above'
          }
        </div>
        <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Connect accounting software or enter P&L manually for each entity
        </div>
        <button style={{
          background: simpleEntities.filter(e => e.connected).length > 0 ? '#2563eb' : '#9ca3af',
          color: 'white',
          border: 'none',
          padding: '0.875rem 2rem',
          borderRadius: '8px',
          fontSize: '1rem',
          cursor: simpleEntities.filter(e => e.connected).length > 0 ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s'
        }}>
          Continue to Personal Information →
        </button>
      </div>
    </div>
  );
};

export default EntityCalculatorHybrid;
