// services/session.service.js

export class SessionService {
  constructor() {
    this.sessions = new Map(); // chatId -> { token, user, loginTime, schedules: [] }
  }

  set(chatId, userData) {
    this.sessions.set(chatId, {
      token: userData.token,
      user: userData,
      loginTime: new Date(),
    });
    return true;
  }

  get(chatId) {
    return this.sessions.get(chatId);
  }

  delete(chatId) {
    return this.sessions.delete(chatId);
  }

  has(chatId) {
    return this.sessions.has(chatId);
  }
}

