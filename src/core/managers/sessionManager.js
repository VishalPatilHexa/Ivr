/**
 * ===============================================================================
 * DISTRIBUTED SESSION MANAGER
 * ===============================================================================
 *
 * Redis-backed session management for scalable streaming infrastructure
 * Handles session state, conversation data, and cross-instance communication
 */

const { v4: uuidv4 } = require("uuid");
const Logger = require("../../utils/logger");
const { SESSION_MANAGER, APPLICATION, REDIS_POOL } = require("../../constants");
const redisPool = require("../redis/redisPool");

class SessionManager {
  constructor(options = {}) {
    this.sessionTTL = options.sessionTTL || SESSION_MANAGER.SESSION_TTL;
    this.conversationTTL = options.conversationTTL || SESSION_MANAGER.CONVERSATION_TTL;
    this.lockTTL = options.lockTTL || SESSION_MANAGER.LOCK_TTL;

    // Use Redis connection pool instead of individual connections
    this.redisPool = redisPool;
    this.isConnected = true; // Pool handles connections

    // Session prefixes for Redis keys
    this.prefixes = SESSION_MANAGER.REDIS_PREFIXES;

    this.stats = {
      sessionsCreated: 0,
      sessionsRetrieved: 0,
      sessionsDeleted: 0,
      conversationsActive: 0,
      errors: 0,
    };

    Logger.info("SessionManager initialized with Redis connection pool");
  }

  /**
   * Initialize SessionManager (using Redis pool)
   */
  async initialize() {
    try {
      Logger.info("SessionManager ready with Redis connection pool");
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      return true;
    } catch (error) {
      Logger.error("Failed to initialize SessionManager", error);
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async createSession(sessionData = {}) {
    try {
      const sessionId = sessionData.sessionId || uuidv4();
      const session = {
        id: sessionId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: SESSION_MANAGER.SESSION_STATUS.CREATED,
        clientInfo: sessionData.clientInfo || {},
        metadata: sessionData.metadata || {},
        conversationId: null,
        nodeId: APPLICATION.NODE_ID,
      };

      const key = this.prefixes.session + sessionId;
      await this.redisPool.execute(async (redis) => {
        await redis.setex(key, Math.floor(this.sessionTTL / 1000), JSON.stringify(session));
      }, REDIS_POOL.DATABASES.SESSIONS);

      this.stats.sessionsCreated++;

      Logger.info("Session created", {
        sessionId,
        clientType: session.clientInfo.type,
        nodeId: session.nodeId,
      });

      // Publish session created event
      // TODO: Implement event publishing with Redis pool if needed
      // await this.publishEvent("session:created", { sessionId, session });

      return session;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to create session", error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    try {
      const key = this.prefixes.session + sessionId;
      const sessionData = await this.redisPool.execute(async (redis) => {
        return await redis.get(key);
      }, REDIS_POOL.DATABASES.SESSIONS);

      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData);
      session.lastActivity = Date.now();

      // Update last activity
      await this.redisPool.execute(async (redis) => {
        await redis.setex(key, Math.floor(this.sessionTTL / 1000), JSON.stringify(session));
      }, REDIS_POOL.DATABASES.SESSIONS);

      this.stats.sessionsRetrieved++;

      return session;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to get session", error, { sessionId });
      throw error;
    }
  }

  /**
   * Update session data
   */
  async updateSession(sessionId, updates) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const updatedSession = {
        ...session,
        ...updates,
        lastActivity: Date.now(),
      };

      const key = this.prefixes.session + sessionId;
      await this.redisPool.execute(async (redis) => {
        await redis.setex(key, Math.floor(this.sessionTTL / 1000), JSON.stringify(updatedSession));
      }, REDIS_POOL.DATABASES.SESSIONS);

      Logger.debug("Session updated", { sessionId, updates });

      // Publish session updated event
      // await this.publishEvent("session:updated", { sessionId, updates });

      return updatedSession;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to update session", error, { sessionId });
      throw error;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      // Delete conversation if exists
      if (session.conversationId) {
        await this.deleteConversation(session.conversationId);
      }

      const key = this.prefixes.session + sessionId;
      await this.redisPool.execute(async (redis) => {
        await redis.del(key);
      }, REDIS_POOL.DATABASES.SESSIONS);

      this.stats.sessionsDeleted++;

      Logger.info("Session deleted", { sessionId });

      // Publish session deleted event
      // await this.publishEvent("session:deleted", { sessionId });

      return true;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to delete session", error, { sessionId });
      throw error;
    }
  }

  /**
   * Create conversation data
   */
  async createConversation(conversationId, conversationData) {
    try {
      const conversation = {
        id: conversationId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: "active",
        agentId: conversationData.agentId,
        sessionId: conversationData.sessionId,
        metadata: conversationData.metadata || {},
        messages: [],
        nodeId: APPLICATION.NODE_ID,
      };

      const key = this.prefixes.conversation + conversationId;
      await this.redisPool.execute(async (redis) => {
        await redis.setex(key, Math.floor(this.conversationTTL / 1000), JSON.stringify(conversation));
      }, REDIS_POOL.DATABASES.SESSIONS);

      this.stats.conversationsActive++;

      Logger.info("Conversation created", {
        conversationId,
        sessionId: conversationData.sessionId,
        agentId: conversationData.agentId,
      });

      return conversation;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to create conversation", error);
      throw error;
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId) {
    try {
      const key = this.prefixes.conversation + conversationId;
      const conversationData = await this.redisPool.execute(async (redis) => {
        return await redis.get(key);
      }, REDIS_POOL.DATABASES.SESSIONS);

      if (!conversationData) {
        return null;
      }

      const conversation = JSON.parse(conversationData);
      conversation.lastActivity = Date.now();

      // Update last activity
      await this.redisPool.execute(async (redis) => {
        await redis.setex(key, Math.floor(this.conversationTTL / 1000), JSON.stringify(conversation));
      }, REDIS_POOL.DATABASES.SESSIONS);

      return conversation;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to get conversation", error, { conversationId });
      throw error;
    }
  }

  /**
   * Add message to conversation
   */
  async addConversationMessage(conversationId, message) {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const messageWithTimestamp = {
        ...message,
        timestamp: Date.now(),
        id: uuidv4(),
      };

      conversation.messages.push(messageWithTimestamp);
      conversation.lastActivity = Date.now();

      // Keep only last 100 messages to prevent memory issues
      if (conversation.messages.length > 100) {
        conversation.messages = conversation.messages.slice(-100);
      }

      const key = this.prefixes.conversation + conversationId;
      await this.redisPool.execute(async (redis) => {
        await redis.setex(key, Math.floor(this.conversationTTL / 1000), JSON.stringify(conversation));
      }, REDIS_POOL.DATABASES.SESSIONS);

      return messageWithTimestamp;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to add conversation message", error, {
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId) {
    try {
      const key = this.prefixes.conversation + conversationId;
      const deleted = await this.redisPool.execute(async (redis) => {
        return await redis.del(key);
      }, REDIS_POOL.DATABASES.SESSIONS);

      if (deleted) {
        this.stats.conversationsActive = Math.max(
          0,
          this.stats.conversationsActive - 1
        );
        Logger.info("Conversation deleted", { conversationId });
      }

      return deleted > 0;
    } catch (error) {
      this.stats.errors++;
      Logger.error("Failed to delete conversation", error, { conversationId });
      throw error;
    }
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(resource, ttl = this.lockTTL) {
    try {
      const lockKey = this.prefixes.lock + resource;
      const lockValue = uuidv4();
      const acquired = await this.redisPool.execute(async (redis) => {
        return await redis.set(lockKey, lockValue, 'PX', ttl * 1000, 'NX');
      }, REDIS_POOL.DATABASES.LOCKS);

      if (acquired) {
        Logger.debug("Lock acquired", { resource, lockValue, ttl });
        return lockValue;
      }

      return null;
    } catch (error) {
      Logger.error("Failed to acquire lock", error, { resource });
      throw error;
    }
  }

  /**
   * Release distributed lock
   */
  async releaseLock(resource, lockValue) {
    try {
      const lockKey = this.prefixes.lock + resource;
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redisPool.execute(async (redis) => {
        return await redis.eval(script, 1, lockKey, lockValue);
      }, REDIS_POOL.DATABASES.LOCKS);

      Logger.debug("Lock release attempt", {
        resource,
        lockValue,
        released: result === 1,
      });
      return result === 1;
    } catch (error) {
      Logger.error("Failed to release lock", error, { resource, lockValue });
      throw error;
    }
  }

  /**
   * Publish event to other instances
   */
  async publishEvent(eventType, data) {
    try {
      const event = {
        type: eventType,
        data,
        timestamp: Date.now(),
        nodeId: APPLICATION.NODE_ID,
      };

      await this.pubClient.publish("ivr:events", JSON.stringify(event));
      Logger.debug("Event published", { eventType, nodeId: event.nodeId });
    } catch (error) {
      Logger.error("Failed to publish event", error, { eventType });
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.subClient.subscribe("ivr:events", (message) => {
      try {
        const event = JSON.parse(message);

        // Don't process our own events
        if (
          event.nodeId === (process.env.NODE_ID || require("os").hostname())
        ) {
          return;
        }

        Logger.debug("Event received", {
          type: event.type,
          from: event.nodeId,
        });

        // Handle different event types
        switch (event.type) {
          case "session:created":
            this.handleRemoteSessionCreated(event.data);
            break;
          case "session:updated":
            this.handleRemoteSessionUpdated(event.data);
            break;
          case "session:deleted":
            this.handleRemoteSessionDeleted(event.data);
            break;
        }
      } catch (error) {
        Logger.error("Failed to process event", error);
      }
    });
  }

  /**
   * Handle remote session events
   */
  handleRemoteSessionCreated(data) {
    Logger.debug("Remote session created", data);
  }

  handleRemoteSessionUpdated(data) {
    Logger.debug("Remote session updated", data);
  }

  handleRemoteSessionDeleted(data) {
    Logger.debug("Remote session deleted", data);
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.updateHealthStatus();
        await this.updateStats();
      } catch (error) {
        Logger.error("Health monitoring failed", error);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Update health status in Redis
   */
  async updateHealthStatus() {
    try {
      const nodeId = process.env.NODE_ID || require("os").hostname();
      const healthKey = this.prefixes.health + nodeId;

      const health = {
        nodeId,
        timestamp: Date.now(),
        status: "healthy",
        stats: this.stats,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      };

      await this.redisPool.execute(async (redis) => {
        await redis.setex(healthKey, 60, JSON.stringify(health));
      }, REDIS_POOL.DATABASES.SESSIONS);
    } catch (error) {
      Logger.error("Failed to update health status", error);
    }
  }

  /**
   * Update global stats
   */
  async updateStats() {
    try {
      const statsKey = this.prefixes.stats + "global";
      const nodeId = process.env.NODE_ID || require("os").hostname();

      await this.redisPool.execute(async (redis) => {
        await redis.hset(statsKey, nodeId, JSON.stringify({
          ...this.stats,
          timestamp: Date.now(),
        }));
        await redis.expire(statsKey, 300); // 5 minutes TTL
      }, REDIS_POOL.DATABASES.SESSIONS);
    } catch (error) {
      Logger.error("Failed to update stats", error);
    }
  }

  /**
   * Get global statistics
   */
  async getGlobalStats() {
    try {
      const statsKey = this.prefixes.stats + "global";
      const allStats = await this.redisPool.execute(async (redis) => {
        return await redis.hgetall(statsKey);
      }, REDIS_POOL.DATABASES.SESSIONS);

      const globalStats = {
        nodes: {},
        totals: {
          sessionsCreated: 0,
          sessionsRetrieved: 0,
          sessionsDeleted: 0,
          conversationsActive: 0,
          errors: 0,
        },
      };

      for (const [nodeId, statsJson] of Object.entries(allStats)) {
        const nodeStats = JSON.parse(statsJson);
        globalStats.nodes[nodeId] = nodeStats;

        // Aggregate totals
        Object.keys(globalStats.totals).forEach((key) => {
          globalStats.totals[key] += nodeStats[key] || 0;
        });
      }

      return globalStats;
    } catch (error) {
      Logger.error("Failed to get global stats", error);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test Redis connectivity
      const testKey = "ivr:health:test";
      await this.redisPool.execute(async (redis) => {
        await redis.setex(testKey, 10, 'test');
        const testValue = await redis.get(testKey);
        await redis.del(testKey);
        return testValue;
      }, REDIS_POOL.DATABASES.SESSIONS);

      if (testValue !== "test") {
        throw new Error("Redis connectivity test failed");
      }

      return {
        status: "healthy",
        redis: "connected",
        stats: this.stats,
      };
    } catch (error) {
      Logger.error("Health check failed", error);
      return {
        status: "unhealthy",
        redis: "disconnected",
        error: error.message,
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      Logger.info("Shutting down SessionManager...");

      // Redis pool handles connection cleanup automatically
      // Pub/sub clients no longer needed with Redis pool

      this.isConnected = false;
      Logger.info("SessionManager shutdown completed");
    } catch (error) {
      Logger.error("Error during SessionManager shutdown", error);
    }
  }
}

module.exports = SessionManager;
