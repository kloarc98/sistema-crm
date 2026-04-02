import jwt from 'jsonwebtoken';

function getJwtSecret() {
  const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
  if (!JWT_SECRET) {
    throw new Error('Falta JWT_SECRET en server/.env');
  }
  return JWT_SECRET;
}

function getJwtExpiresIn() {
  return String(process.env.JWT_EXPIRES_IN || '12h').trim() || '12h';
}

function parseBearerToken(authorizationHeader) {
  const value = String(authorizationHeader || '').trim();
  if (!value.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return value.slice(7).trim();
}

export function createAccessToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getJwtExpiresIn() });
}

export function attachAuthContext(req, _res, next) {
  const token = parseBearerToken(req.headers?.authorization);
  if (!token) {
    req.auth = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = Number(decoded?.sub || decoded?.id || 0);
    const username = String(decoded?.username || '').trim();
    const role = String(decoded?.role || '').trim();

    req.auth = {
      userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      username,
      role,
      tokenPayload: decoded,
    };

    if (req.auth.userId && !req.headers['x-user-id']) {
      req.headers['x-user-id'] = String(req.auth.userId);
    }
    if (req.auth.role && !req.headers['x-user-role']) {
      req.headers['x-user-role'] = req.auth.role;
    }
    if (req.auth.username && !req.headers['x-user-username']) {
      req.headers['x-user-username'] = req.auth.username;
    }
  } catch {
    req.auth = null;
  }

  return next();
}

export function requireAuth(req, res, next) {
  if (req.auth?.userId) {
    return next();
  }

  return res.status(401).json({ error: 'No autenticado' });
}
