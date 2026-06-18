const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_POD_PORT) || 3306,
  user: process.env.DB_POD_USERNAME,
  password: process.env.DB_POD_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
