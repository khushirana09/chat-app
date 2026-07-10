const mongoose = require("mongoose");

//define a schema for the user collection
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true, // no duplicate usernames
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  profilePicture: {
    type: String,
    default: "",
  },
  about: {
    type: String,
    default: "",
  },
  lastSeen: {
    type: Date,
    default: null,
  },

  //for password reset
  resetToken: { type: String },
  resetTokenExpiry: { type: Number },
});

//export the modal to use in routes
module.exports = mongoose.model("User", UserSchema);
