/**
 * ===============================================================================
 * REPLICA DATABASE CONFIGURATION
 * ===============================================================================
 *
 * Read replica database configuration for read operations
 */

const options = {
  DB: {
    HOST: "hexahealth-replica-db.cqnt4cbjitmj.ap-south-1.rds.amazonaws.com",
    USER: "preproduser",
    PASSWORD: "hexa@mysql",
    DB: "new_dev_db",
    dialect: "mysql",
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  },
};

module.exports = options;
