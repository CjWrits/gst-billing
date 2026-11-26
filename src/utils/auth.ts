import { db, logAudit } from '../db/database';
import { User, UserSession, BusinessProfile, TaxScheme } from '../types';

const SESSION_KEY = 'gogst_auth_session_token';

/**
 * Generates a random cryptographic hex salt
 */
export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a random session token
 */
export function generateToken(): string {
  return `${generateSalt(24)}-${Date.now()}`;
}

/**
 * Hashes a plaintext password with a salt using standard Web Crypto SHA-256
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}:gogst_secure_salt`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  business: {
    name: string;
    companyName?: string;
    legalName?: string;
    fullName?: string;
    isGstRegistered?: boolean;
    taxScheme?: TaxScheme;
    gstin: string;
    phone: string;
    email: string;
    address?: string;
    addressLine1?: string;
    addressLine2?: string;
    pincode?: string;
    city?: string;
    stateCode: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branchName: string;
    upiId: string;
    invoicePrefix: string;
    termsAndConditions?: string;
  };
}

/**
 * Registers a new user account and creates an active session
 */
export async function registerUserAccount(name: string, email: string, password: string): Promise<{ user: User; session: UserSession }> {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.users.where('email').equals(normalizedEmail).first();
  if (existing) {
    throw new Error('An account with this email address already exists. Please sign in instead.');
  }

  const userId = `usr-${Date.now()}`;
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  const newUser: User = {
    id: userId,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    salt,
    role: 'owner',
    createdAt: now,
    lastLoginAt: now
  };

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const newSession: UserSession = {
    token,
    userId,
    email: normalizedEmail,
    name: name.trim(),
    createdAt: now,
    expiresAt
  };

  await db.transaction('rw', [db.users, db.sessions, db.historyLogs], async () => {
    await db.users.add(newUser);
    await db.sessions.add(newSession);
  });

  await logAudit({
    userId,
    action: 'USER_REGISTERED',
    entityType: 'AUTH',
    entityId: userId,
    title: 'User Account Created',
    details: `User ${newUser.name} created an account with ${newUser.email}.`
  });

  localStorage.setItem(SESSION_KEY, token);

  return { user: newUser, session: newSession };
}

/**
 * Registers a new user and sets up their real business profile
 */
export async function registerUser(input: RegisterInput): Promise<{ user: User; session: UserSession; profile: BusinessProfile }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  // Check if user already exists
  const existing = await db.users.where('email').equals(normalizedEmail).first();
  if (existing) {
    throw new Error('An account with this email address already exists. Please sign in instead.');
  }

  const userId = `usr-${Date.now()}`;
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const now = new Date().toISOString();

  const newUser: User = {
    id: userId,
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash,
    salt,
    role: 'owner',
    createdAt: now,
    lastLoginAt: now
  };

  const companyName = (input.business.companyName || input.business.name || '').trim();
  const fullName = (input.business.fullName || input.business.legalName || companyName).trim();
  const isGstRegistered = typeof input.business.isGstRegistered === 'boolean'
    ? input.business.isGstRegistered
    : Boolean(input.business.gstin && input.business.gstin.trim());
  const addressLine1 = (input.business.addressLine1 || input.business.address || '').trim();
  const addressLine2 = (input.business.addressLine2 || '').trim();
  const pincode = (input.business.pincode || '').trim();
  const city = (input.business.city || '').trim();

  const fullAddress = [
    addressLine1,
    addressLine2,
    city && pincode ? `${city} - ${pincode}` : (city || pincode)
  ].filter(Boolean).join(', ');

  const newProfile: BusinessProfile = {
    userId,
    name: companyName,
    companyName,
    fullName,
    legalName: fullName,
    tradeName: companyName,
    isGstRegistered,
    taxScheme: (input.business.taxScheme as TaxScheme) || 'REGULAR',
    gstin: isGstRegistered ? input.business.gstin.trim().toUpperCase() : '',
    phone: input.business.phone.trim(),
    email: input.business.email.trim() || normalizedEmail,
    addressLine1,
    addressLine2,
    pincode,
    city,
    address: fullAddress,
    stateCode: input.business.stateCode || '08',
    bankName: input.business.bankName.trim(),
    accountNumber: input.business.accountNumber.trim(),
    ifscCode: input.business.ifscCode.trim().toUpperCase(),
    branchName: input.business.branchName.trim(),
    upiId: input.business.upiId.trim(),
    invoicePrefix: input.business.invoicePrefix.trim() || 'INV/26-27/',
    termsAndConditions: input.business.termsAndConditions?.trim() || 
      '1. Goods once sold will not be taken back.\n2. Payment due within 15 days of invoice date.\n3. Subject to local jurisdiction only.',
    createdAt: now,
    updatedAt: now
  };

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const newSession: UserSession = {
    token,
    userId,
    email: normalizedEmail,
    name: input.name.trim(),
    createdAt: now,
    expiresAt
  };

  await db.transaction('rw', [db.users, db.businessProfile, db.sessions, db.historyLogs], async () => {
    await db.users.add(newUser);
    await db.businessProfile.add(newProfile);
    await db.sessions.add(newSession);
  });

  await logAudit({
    userId,
    action: 'USER_REGISTERED',
    entityType: 'AUTH',
    entityId: userId,
    title: 'Account Registered & Business Initialized',
    details: `User ${newUser.name} created account and configured business profile for "${newProfile.name}" (GSTIN: ${newProfile.gstin}).`
  });

  localStorage.setItem(SESSION_KEY, token);

  return { user: newUser, session: newSession, profile: newProfile };
}

/**
 * Authenticates user credentials and creates a session
 */
export async function loginUser(email: string, password: string): Promise<{ user: User; session: UserSession; profile: BusinessProfile | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.users.where('email').equals(normalizedEmail).first();

  if (!user) {
    throw new Error('No registered account found with this email. Please register first.');
  }

  const computedHash = await hashPassword(password, user.salt);
  if (computedHash !== user.passwordHash) {
    throw new Error('Incorrect password. Please verify your credentials.');
  }

  const profile = (await db.businessProfile.where('userId').equals(user.id).first()) || null;

  const now = new Date().toISOString();
  await db.users.update(user.id, { lastLoginAt: now });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const session: UserSession = {
    token,
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: now,
    expiresAt
  };

  await db.sessions.add(session);
  localStorage.setItem(SESSION_KEY, token);

  await logAudit({
    userId: user.id,
    action: 'USER_LOGIN',
    entityType: 'AUTH',
    entityId: user.id,
    title: 'User Signed In',
    details: `${user.name} (${user.email}) logged into ${profile ? profile.name : 'GoGST Bill (Setup Pending)'}.`
  });

  return { user, session, profile };
}

/**
 * Validates and restores session from localStorage
 */
export async function getActiveSession(): Promise<{ user: User; session: UserSession; profile: BusinessProfile | null } | null> {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return null;

  const session = await db.sessions.get(token);
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await db.sessions.delete(token);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  const user = await db.users.get(session.userId);
  if (!user) {
    await db.sessions.delete(token);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }

  const profile = (await db.businessProfile.where('userId').equals(user.id).first()) || null;

  return { user, session, profile };
}

/**
 * Logs out the current user and clears active session
 */
export async function logoutUser(userId?: string): Promise<void> {
  const token = localStorage.getItem(SESSION_KEY);
  if (token) {
    await db.sessions.delete(token);
    localStorage.removeItem(SESSION_KEY);
  }

  if (userId) {
    await logAudit({
      userId,
      action: 'USER_LOGOUT',
      entityType: 'AUTH',
      entityId: userId,
      title: 'User Signed Out',
      details: 'User closed session and logged out.'
    });
  }
}
