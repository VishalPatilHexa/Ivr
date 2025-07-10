const { v4: uuidv4 } = require('uuid');

class ConversationService {
  constructor() {
    this.sessions = new Map();
  }

  createSession() {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: new Date(),
      messages: [],
      patientData: {}
    });
    return sessionId;
  }

  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push({
        ...message,
        timestamp: new Date()
      });
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  endSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  updatePatientData(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session.patientData, data);
    }
  }
}

module.exports = { ConversationService };