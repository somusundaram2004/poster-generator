const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Poster = sequelize.define(
  "Poster",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    category: {
      type: DataTypes.ENUM("exam", "fee", "wishes", "announcement", "class", "timetable"),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fields_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    ai_heading: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_footer: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    bg_image_path: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    qr_path: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    final_poster_path: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    cloudinaryId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("pending", "processing", "done", "failed"),
      defaultValue: "pending",
    },
  },
  {
    tableName: "posters",
    timestamps: true,
  }
);

module.exports = Poster;
