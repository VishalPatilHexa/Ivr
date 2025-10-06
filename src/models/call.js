/**
 * ===============================================================================
 * OUTBOUND CALLS MODEL
 * ===============================================================================
 *
 * Database model for tracking outbound call records
 */
const { DATABASE, CALL_STATUS } = require("../constants");

module.exports = (sequelize, DataTypes) => {
  const IvrCall = sequelize.define(
    DATABASE.TABLES.IVR_CALLS,
    {
      id: {
        primaryKey: true,
        type: DataTypes.BIGINT,
        autoIncrement: true,
      },
      campaignId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      crmSynced: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      provider: {
        type: DataTypes.ENUM("knowlarity", "acephone"),
        allowNull: false,
      },
      callerNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      customerNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      countryCode: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 91,
      },
      srNumber: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      sessionId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0, // 0: initiated, 1: completed, 2: failed, 3: cancelled
        validate: {
          isIn: [Object.values(CALL_STATUS)],
        },
      },
      providerResponse: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER, // Duration in seconds
        allowNull: true,
      },
      callStartTime: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      callEndTime: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      extractedJson: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: DataTypes.BIGINT,
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.BIGINT,
      },
    },
    {
      timestamps: false,
      hooks: {
        beforeCreate: (record, options) => {
          record.dataValues.createdAt = Math.floor(Date.now());
          record.dataValues.updatedAt = Math.floor(Date.now());
        },
        beforeBulkCreate: (records, options) => {
          records.forEach((record) => {
            record.dataValues.createdAt = Math.floor(Date.now());
            record.dataValues.updatedAt = Math.floor(Date.now());
          });
        },
        beforeUpdate: (record, options) => {
          record.dataValues.updatedAt = Math.floor(Date.now());
        },
        beforeBulkUpdate: (record, options) => {
          record.attributes.updatedAt = Math.floor(Date.now());
        },
      },
      indexes: [
        { fields: ["campaignId"] },
        { fields: ["customerNumber"] },
        {
          fields: ["status"],
        },
        {
          fields: ["provider"],
        },
        {
          fields: ["sessionId"],
        },
        {
          fields: ["createdAt"],
        },
      ],
    }
  );

  return IvrCall;
};
