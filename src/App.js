import React, { useState, useEffect } from 'react';
import './App.css';

const CLIENT_ID = process.env.REACT_APP_SF_CLIENT_ID;
const REDIRECT_URI = process.env.REACT_APP_REDIRECT_URI;
const SF_LOGIN_URL = 'https://login.salesforce.com';
const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [instanceUrl, setInstanceUrl] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [validationRules, setValidationRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingChanges, setPendingChanges] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, '/');
    }
    const savedToken = sessionStorage.getItem('sf_access_token');
    const savedInstance = sessionStorage.getItem('sf_instance_url');
    if (savedToken && savedInstance) {
      setAccessToken(savedToken);
      setInstanceUrl(savedInstance);
      fetchUserInfo(savedToken, savedInstance);
    }
  }, []);

  const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const generateCodeChallenge = async (verifier) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const handleLogin = async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem('code_verifier', verifier);
    const authUrl =
      `${SF_LOGIN_URL}/services/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=full%20refresh_token` +
      `&code_challenge=${challenge}` +
      `&code_challenge_method=S256`;
    window.location.href = authUrl;
  };

  const exchangeCodeForToken = async (code) => {
    setLoading(true);
    setMessage('Logging in...');
    try {
      const res = await fetch(`${API_URL}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: sessionStorage.getItem('code_verifier') }),
      });
      const data = await res.json();
      if (data.access_token) {
        setAccessToken(data.access_token);
        setInstanceUrl(data.instance_url);
        sessionStorage.setItem('sf_access_token', data.access_token);
        sessionStorage.setItem('sf_instance_url', data.instance_url);
        fetchUserInfo(data.access_token, data.instance_url);
        setMessage('');
      } else {
        setMessage('Login failed. Please try again.');
      }
    } catch (err) {
      setMessage('Login error: ' + err.message);
    }
    setLoading(false);
  };

  const fetchUserInfo = async (token, instance) => {
    try {
      const res = await fetch(`${instance}/services/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUserInfo(data);
    } catch (err) {
      console.error('Could not fetch user info', err);
    }
  };

  const fetchValidationRules = async () => {
    setLoading(true);
    setMessage('Fetching validation rules...');
    try {
      const res = await fetch(`${API_URL}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, instanceUrl }),
      });
      const data = await res.json();
      setValidationRules(data.records || []);
      setPendingChanges({});
      setMessage(`Found ${data.records?.length || 0} validation rules.`);
    } catch (err) {
      setMessage('Error fetching rules: ' + err.message);
    }
    setLoading(false);
  };

  const toggleRule = (ruleId, currentActive) => {
    setPendingChanges((prev) => ({ ...prev, [ruleId]: !currentActive }));
    setValidationRules((prev) =>
      prev.map((r) => r.Id === ruleId ? { ...r, Active: !currentActive } : r)
    );
  };

  const deployChanges = async () => {
    if (Object.keys(pendingChanges).length === 0) {
      setMessage('No changes to deploy.');
      return;
    }
    setLoading(true);
    setMessage('Deploying changes to Salesforce...');
    let successCount = 0;
    let failCount = 0;
    for (const [ruleId, newActive] of Object.entries(pendingChanges)) {
      try {
        const res = await fetch(`${API_URL}/api/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, instanceUrl, ruleId, active: newActive }),
        });
        if (res.ok) { successCount++; } else { failCount++; }
      } catch { failCount++; }
    }
    setPendingChanges({});
    setMessage(`Done! ${successCount} rule(s) updated successfully.${failCount > 0 ? ` ${failCount} failed.` : ''}`);
    setLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setAccessToken(null); setInstanceUrl(null);
    setUserInfo(null); setValidationRules([]);
    setPendingChanges({}); setMessage('');
  };

  const enableAll = () => {
    const changes = {};
    validationRules.forEach((r) => { changes[r.Id] = true; });
    setPendingChanges(changes);
    setValidationRules((prev) => prev.map((r) => ({ ...r, Active: true })));
  };

  const disableAll = () => {
    const changes = {};
    validationRules.forEach((r) => { changes[r.Id] = false; });
    setPendingChanges(changes);
    setValidationRules((prev) => prev.map((r) => ({ ...r, Active: false })));
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">⚡ SF Validation Manager</div>
          {userInfo && (
            <div className="user-info">
              <span className="user-name">👤 {userInfo.name}</span>
              <span className="user-org">{userInfo.organization_id}</span>
              <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>
      <main className="main">
        {!accessToken ? (
          <div className="login-card">
            <div className="login-icon">☁️</div>
            <h1>Salesforce Validation Manager</h1>
            <p>Connect to your Salesforce org to manage validation rules</p>
            <button className="btn btn-primary btn-large" onClick={handleLogin} disabled={loading}>
              {loading ? 'Connecting...' : '🔐 Login with Salesforce'}
            </button>
            {message && <p className="message">{message}</p>}
          </div>
        ) : (
          <div className="dashboard">
            <div className="toolbar">
              <button className="btn btn-primary" onClick={fetchValidationRules} disabled={loading}>
                {loading ? '⏳ Loading...' : '📋 Get Validation Rules'}
              </button>
              {validationRules.length > 0 && (
                <>
                  <button className="btn btn-success" onClick={enableAll}>✅ Enable All</button>
                  <button className="btn btn-danger" onClick={disableAll}>🚫 Disable All</button>
                  <button className="btn btn-deploy" onClick={deployChanges}
                    disabled={loading || Object.keys(pendingChanges).length === 0}>
                    🚀 Deploy Changes {Object.keys(pendingChanges).length > 0 && `(${Object.keys(pendingChanges).length})`}
                  </button>
                </>
              )}
            </div>
            {message && (
              <div className={`alert ${message.includes('Error') || message.includes('failed') ? 'alert-error' : 'alert-success'}`}>
                {message}
              </div>
            )}
            {validationRules.length > 0 && (
              <div className="rules-grid">
                {validationRules.map((rule) => {
                  const hasPending = pendingChanges.hasOwnProperty(rule.Id);
                  return (
                    <div key={rule.Id} className={`rule-card ${rule.Active ? 'active' : 'inactive'} ${hasPending ? 'pending' : ''}`}>
                      <div className="rule-header">
                        <span className="rule-name">{rule.ValidationName}</span>
                        <span className={`badge ${rule.Active ? 'badge-active' : 'badge-inactive'}`}>
                          {rule.Active ? '● Active' : '○ Inactive'}
                        </span>
                      </div>
                      {rule.Description && <p className="rule-desc">{rule.Description}</p>}
                      <div className="rule-footer">
                        <span className="rule-id">ID: {rule.Id}</span>
                        {hasPending && <span className="pending-label">⏳ Pending</span>}
                        <button className={`btn ${rule.Active ? 'btn-danger' : 'btn-success'} btn-small`}
                          onClick={() => toggleRule(rule.Id, rule.Active)}>
                          {rule.Active ? '🚫 Deactivate' : '✅ Activate'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {validationRules.length === 0 && !loading && (
              <div className="empty-state">
                <p>Click "Get Validation Rules" to load rules from your Salesforce org</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;