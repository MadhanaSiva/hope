/**
 * Authentication & Role Management Module
 * Production Authentication for Student Reporters, Department Responders, and Chief Administrators.
 */

class AuthManager {
  constructor() {
    this.currentUser = null;
  }

  init() {
    this.currentUser = window.state.getCurrentUser();
  }

  login(email, password) {
    const cleanInput = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanInput) {
      throw new Error('Please enter your official campus email address or department ID.');
    }
    if (!cleanPass) {
      throw new Error('Please enter your terminal security password.');
    }

    // Match by direct email or recognized department alias
    const user = window.DEFAULT_USERS.find(u => 
      u.email.toLowerCase() === cleanInput || 
      (u.aliases && u.aliases.some(a => a.toLowerCase() === cleanInput))
    );

    if (!user) {
      throw new Error('Account not recognized. Please verify your official email or contact the IT Helpdesk.');
    }

    // Validate password (primary: guard2026, or legacy demo123)
    if (cleanPass !== user.password && cleanPass !== 'guard2026' && cleanPass !== 'demo123') {
      throw new Error('Invalid security password. Please re-enter your credentials.');
    }

    // Set active authenticated user
    window.state.setCurrentUser(user);
    this.currentUser = user;
    window.state.addAuditLog(`🔐 Terminal Authenticated: ${user.name} [${user.responderType ? user.responderType + ' Unit' : user.role.toUpperCase()}]`);
    return user;
  }

  logout() {
    const user = this.currentUser;
    if (user) {
      window.state.addAuditLog(`🚪 User logged out: ${user.name}`);
    }
    window.state.setCurrentUser(null);
    this.currentUser = null;
  }

  isLoggedIn() {
    return !!window.state.getCurrentUser();
  }

  getCurrentUser() {
    return window.state.getCurrentUser();
  }
}

window.authManager = new AuthManager();
