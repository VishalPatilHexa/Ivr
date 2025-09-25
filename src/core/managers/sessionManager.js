/**
 * ===============================================================================
 * DISTRIBUTED SESSION MANAGER
 * ===============================================================================
 *
 * Redis-backed session management for scalable streaming infrastructure
 * Handles session state, conversation data, and cross-instance communication
 */

const redis = require("redis");
const { v4: uuidv4 } = require("uuid");
const Logger = require("../../utils/logger");
const { SESSION_MANAGER, APPLICATION } = require("../../constants");

class SessionManager {
  constructor(options = {}) {
    this.redisConfig = {
      host: options.redisHost || SESSION_MANAGER.REDIS_CONFIG.HOST,
      port: options.redisPort || SESSION_MANAGER.REDIS_CONFIG.PORT,
      password: options.redisPassword || SESSION_MANAGER.REDIS_CONFIG.PASSWORD,
      retryAttempts:
        options.retryAttempts || SESSION_MANAGER.REDIS_CONFIG.RETRY_ATTEMPTS,
      retryDelay:
        options.retryDelay || SESSION_MANAGER.REDIS_CONFIG.RETRY_DELAY,
    };

    this.sessionTTL = options.sessionTTL || SESSION_MANAGER.SESSION_TTL;
    this.conversationTTL =
      options.conversationTTL || SESSION_MANAGER.CONVERSATION_TTL;
    this.lockTTL = options.lockTTL || SESSION_MANAGER.LOCK_TTL;

    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;

    // Session prefixes for Redis keys
    this.prefixes = SESSION_MANAGER.REDIS_PREFIXES;

    this.stats = {
      sessionsCreated: 0,
      sessionsRetrieved: 0,
      sessionsDeleted: 0,
      conversationsActive: 0,
      errors: 0,
    };
  }

  /**
   * Initialize Redis connections
   */
  async initialize() {
    try {
      // Main Redis client
      this.client = redis.createClient({
        socket: {
          host: this.redisConfig.host,
          port: this.redisConfig.port,
        },
        password: this.redisConfig.password,
        retry_strategy: (options) => {
          if (options.error && options.error.code === "ECONNREFUSED") {
            Logger.error("Redis connection refused");
            return new Error("Redis connection refused");
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            Logger.error("Redis retry time exhausted");
            return new Error("Retry time exhausted");
          }
          if (options.attempt > this.redisConfig.retryAttempts) {
            Logger.error("Redis max retry attempts reached");
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      // Publisher client for cross-instance communication
      this.pubClient = this.client.duplicate();

      // Subscriber client for events
      this.subClient = this.client.duplicate();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.pubClient.connect(),
        this.subClient.connect(),
      ]);

      this.isConnected = true;

      // Setup event listeners
      this.setupEventListeners();

      Logger.success("SessionManager initialized with Redis", {
        host: this.redisConfig.host,
        port: this.redisConfig.port,
      });

      // Start health monitoring
      this.startHealthMonitoring();
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
      await this.client.setEx(key, this.sessionTTL, JSON.stringify(session));

      this.stats.sessionsCreated++;

      Logger.info("Session created", {
        sessionId,
        clientType: session.clientInfo.type,
        nodeId: session.nodeId,
      });

      // Publish session created event
      await this.publishEvent("session:created", { sessionId, session });

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
      const sessionData = await this.client.get(key);

      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData);
      session.lastActivity = Date.now();

      // Update last activity
      await this.client.setEx(key, this.sessionTTL, JSON.stringify(session));

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
      await this.client.setEx(
        key,
        this.sessionTTL,
        JSON.stringify(updatedSession)
      );

      Logger.debug("Session updated", { sessionId, updates });

      // Publish session updated event
      await this.publishEvent("session:updated", { sessionId, updates });

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
      await this.client.del(key);

      this.stats.sessionsDeleted++;

      Logger.info("Session deleted", { sessionId });

      // Publish session deleted event
      await this.publishEvent("session:deleted", { sessionId });

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
      await this.client.setEx(
        key,
        this.conversationTTL,
        JSON.stringify(conversation)
      );

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
      const conversationData = await this.client.get(key);

      if (!conversationData) {
        return null;
      }

      const conversation = JSON.parse(conversationData);
      conversation.lastActivity = Date.now();

      // Update last activity
      await this.client.setEx(
        key,
        this.conversationTTL,
        JSON.stringify(conversation)
      );

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
      await this.client.setEx(
        key,
        this.conversationTTL,
        JSON.stringify(conversation)
      );

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
      const deleted = await this.client.del(key);

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
      const acquired = await this.client.set(lockKey, lockValue, {
        PX: ttl * 1000,
        NX: true,
      });

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

      const result = await this.client.eval(script, {
        keys: [lockKey],
        arguments: [lockValue],
      });

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

      await this.client.setEx(healthKey, 60, JSON.stringify(health));
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

      await this.client.hSet(
        statsKey,
        nodeId,
        JSON.stringify({
          ...this.stats,
          timestamp: Date.now(),
        })
      );

      await this.client.expire(statsKey, 300); // 5 minutes TTL
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
      const allStats = await this.client.hGetAll(statsKey);

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
      await this.client.set(testKey, "test", { EX: 10 });
      const testValue = await this.client.get(testKey);
      await this.client.del(testKey);

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

      if (this.client) await this.client.quit();
      if (this.pubClient) await this.pubClient.quit();
      if (this.subClient) await this.subClient.quit();

      this.isConnected = false;
      Logger.info("SessionManager shutdown completed");
    } catch (error) {
      Logger.error("Error during SessionManager shutdown", error);
    }
  }
}

module.exports = SessionManager;
