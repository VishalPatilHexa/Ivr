/**
 * ===============================================================================
 * SESSIONS MODEL
 * ===============================================================================
 *
 * Database model for IVR session tracking
 */

const { DATABASE } = require("../constants");

module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define(
    DATABASE.TABLES.SESSIONS,
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      sessionId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: true,
        },
      },
      patientId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      agentId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phoneNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "created",
          "active",
          "completed",
          "terminated",
          "failed"
        ),
        defaultValue: "created",
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER, // Duration in seconds
        allowNull: true,
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
          fields: ["sessionId"],
        },
        {
          fields: ["patientId"],
        },
        {
          fields: ["status"],
        },
        {
          fields: ["startTime"],
        },
      ],
    }
  );

  // Define associations
  Session.associate = (models) => {
    // Remove patients association since patients model doesn't exist
    Session.hasMany(models.conversations, {
      foreignKey: "sessionId",
      as: "conversations",
    });
  };

  return Session;
};
