/**
 * ===============================================================================
 * DATABASE MODELS INDEX
 * ===============================================================================
 * 
 * Sequelize database models initialization and associations
 * Handles both primary and replica database connections
 */

const env = process.env.NODE_ENV || "development";
const config = require("../config/database/dbconfig");
const replicaConfig = require("../config/database/replicadbconfig");
const fs = require("fs");
const path = require("path");
const basename = path.basename(__filename);
const ZER0 = 0;
const NEGATIVE_THREE = -3;
const Sequelize = require("sequelize");
const Logger = require("../utils/logger");

// Initialize primary database connection (for writes)
let sequelize = new Sequelize(config.DB.DB, config.DB.USER, config.DB.PASSWORD, {
    host: config.DB.HOST,
    dialect: config.DB.dialect,
    operatorsAliases: 0,
    define: {
        freezeTableName: true,
    },
    pool: {
        max: config.DB.pool.max,
        min: config.DB.pool.min,
        acquire: config.DB.pool.acquire,
        idle: config.DB.pool.idle,
    },
    logging: env === 'production' ? false : (msg) => Logger.info('Database Query', { query: msg }),
    timezone: '+05:30', // IST timezone
});

// Initialize replica database connection (for reads)
let replicaSequelize = new Sequelize(replicaConfig.DB.DB, replicaConfig.DB.USER, replicaConfig.DB.PASSWORD, {
    host: replicaConfig.DB.HOST,
    dialect: replicaConfig.DB.dialect,
    operatorsAliases: 0,
    define: {
        freezeTableName: true,
    },
    pool: {
        max: replicaConfig.DB.pool.max,
        min: replicaConfig.DB.pool.min,
        acquire: replicaConfig.DB.pool.acquire,
        idle: replicaConfig.DB.pool.idle,
    },
    logging: env === 'production' ? false : (msg) => Logger.info('Replica Database Query', { query: msg }),
    timezone: '+05:30', // IST timezone
});

const db = {};

// Load all model files dynamically
fs.readdirSync(__dirname)
    .filter((file) => file.indexOf(".") !== ZER0 && file !== basename && file.slice(NEGATIVE_THREE) === ".js")
    .forEach((file) => {
        try {
            var model = require(path.join(__dirname, file))(sequelize, Sequelize);
            db[model.name] = model;
            Logger.info(`Model loaded: ${model.name}`);
        } catch (error) {
            Logger.error(`Failed to load model from file: ${file}`, error);
        }
    });

// Set up model associations
Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        try {
            db[modelName].associate(db);
            Logger.info(`Associations loaded for model: ${modelName}`);
        } catch (error) {
            Logger.error(`Failed to load associations for model: ${modelName}`, error);
        }
    }
});

// Database connection health check
const testConnections = async () => {
    try {
        await sequelize.authenticate();
        Logger.success('Primary database connection established successfully');
    } catch (error) {
        Logger.error('Unable to connect to primary database:', error);
    }

    try {
        await replicaSequelize.authenticate();
        Logger.success('Replica database connection established successfully');
    } catch (error) {
        Logger.error('Unable to connect to replica database:', error);
    }
};

// Test connections on startup
testConnections();

// Export database instances and models
db.Sequelize = Sequelize;
db.sequelize = sequelize;
db.replicaSequelize = replicaSequelize;

module.exports = db;