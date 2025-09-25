/**
 * ===============================================================================
 * CONVERSATIONS MODEL
 * ===============================================================================
 *
 * Database model for conversation data and messages
 */

const { DATABASE } = require("../constants");

module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define(
    DATABASE.TABLES.CONVERSATIONS,
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      conversationId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      sessionId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
          model: DATABASE.TABLES.SESSIONS,
          key: "sessionId",
        },
      },
      agentId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "paused", "completed", "terminated"),
        defaultValue: "active",
      },
      messages: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sentiment: {
        type: DataTypes.ENUM("positive", "neutral", "negative"),
        allowNull: true,
      },
      language: {
        type: DataTypes.STRING,
        defaultValue: "hi", // Hindi by default
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      indexes: [
        {
          fields: ["conversationId"],
        },
        {
          fields: ["sessionId"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["agentId"],
        },
      ],
    }
  );

  // Define associations
  Conversation.associate = (models) => {
    Conversation.belongsTo(models.sessions, {
      foreignKey: "sessionId",
      targetKey: "sessionId",
      as: "session",
    });
  };

  return Conversation;
};
