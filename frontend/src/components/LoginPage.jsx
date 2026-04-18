import { useState } from 'react';
import crowdLogo from '../assets/CrowdLogo.png';
import '../login.css';

const ALLOWED_USERS = {
  admin: 'admin',
  administrator: 'admin',
  officer: 'officer',
};

const REQUIRED_PASSWORD = 'pass1234';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const onSubmit = (event) => {
    event.preventDefault();

    const normalizedUsername = String(username || '').trim().toLowerCase();
    const role = ALLOWED_USERS[normalizedUsername];

    if (!role) {
      setError('Use username: admin or officer');
      return;
    }

    if (password !== REQUIRED_PASSWORD) {
      setError('Invalid password');
      return;
    }

    setError('');
    onLogin(role);
  };

  return (
    <div className="login-shell">
      <section className="login-card" aria-label="Role login">
        <div className="login-brand">
          <img src={crowdLogo} alt="CrowdShield" />
          <h1>CrowdShield Access</h1>
        </div>

        <p className="login-help">Sign in as administrator or officer</p>

        <form className="login-form" onSubmit={onSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin or officer"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="pass1234"
            autoComplete="current-password"
            required
          />

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit" className="login-submit">Log In</button>
        </form>

        <p className="login-credentials">Allowed users: admin, officer | Password: pass1234</p>
      </section>
    </div>
  );
}
