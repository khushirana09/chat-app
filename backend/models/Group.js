const mongoose = require("mongoose");

// A group is just a name + a fixed list of member usernames. Membership is
// checked against this list wherever group messages are read or sent, so a
// user can never see or post into a group they're not part of.
const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  members: [{ type: String, required: true }], // usernames
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Group", GroupSchema);
