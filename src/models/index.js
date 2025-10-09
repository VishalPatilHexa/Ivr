/**
 * ===============================================================================
 * DATABASE MODELS INDEX
 * ===============================================================================
 *
 * Sequelize database models initialization and associations
 */

const env = process.env.NODE_ENV || "development";
const config = require("../config/database/dbconfig");
const fs = require("fs");
const path = require("path");
const basename = path.basename(__filename);
const ZER0 = 0;
const NEGATIVE_THREE = -3;
const Sequelize = require("sequelize");
const Logger = require("../utils/logger");

// Initialize database connection
let sequelize = new Sequelize(config.DB.DB, config.DB.USER, config.DB.PASSWORD, {
    host: config.DB.HOST,
    port: config.DB.PORT,
    dialect: config.DB.dialect,
    operatorsAliases: 0,
    pool: config.DB.pool,
    dialectOptions: config.DB.dialectOptions,
    query: config.DB.query,
    retry: config.DB.retry,
    timezone: config.DB.timezone,
    logging: config.DB.logging,
    benchmark: config.DB.benchmark,
    define: config.DB.define
});

const db = {};

// Load all model files dynamically
fs.readdirSync(__dirname)
    .filter((file) => file.indexOf(".") !== ZER0 && file !== basename && file.slice(NEGATIVE_THREE) === ".js")
    .forEach((file) => {
        try {
            var model = require(path.join(__dirname, file))(sequelize, Sequelize);
            db[model.name] = model;
        } catch (error) {
            Logger.error(`Failed to load model from file: ${file}`, error);
        }
    });

// Set up model associations
Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        try {
            db[modelName].associate(db);
        } catch (error) {
            Logger.error(`Failed to load associations for model: ${modelName}`, error);
        }
    }
});

// Database connection health check
const testConnections = async () => {
    try {
        await sequelize.authenticate();
    } catch (error) {
        Logger.error('Database connection failed:', error);
    }
};

// Test connections on startup
testConnections();

// Export database instances and models
db.Sequelize = Sequelize;
db.sequelize = sequelize;

module.exports = db;