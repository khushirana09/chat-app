const mongoose = require("mongoose");

// Create a message schema
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true }, // Username or ID of sender
  receiver: { type: String, default: null }, // Username of receiver, "all" for global, or null for a group message
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  message: { type: String, required: true }, // The message text
  timestamp: { type: Date, default: Date.now }, // When it was sent (default = now)
  media: { type: String, default: null }, // for media
  mediaType: { type: String, default: null }, // e.g. "image", "video"
  // Real delivery/read tracking for 1:1 messages only — see server.js for why
  // group/global messages intentionally stay "sent" forever (no per-member
  // read tracking implemented yet).
  status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
  // One reaction per user per message — reactToMessage in server.js enforces
  // that by removing any existing entry from this user before adding a new one.
  reactions: [
    {
      emoji: { type: String, required: true },
      username: { type: String, required: true },
      _id: false,
    },
  ],
  // A denormalized SNAPSHOT of the message being replied to, not a live
  // reference. This is a deliberate tradeoff: if we stored just an ObjectId
  // and populated it on read, a reply preview would break (or need extra
  // handling) the moment the original message was edited or deleted. A
  // snapshot always renders something reasonable, at the cost of not
  // reflecting later edits to the original.
  replyTo: {
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sender: { type: String, default: null },
    message: { type: String, default: null },
    mediaType: { type: String, default: null },
    _id: false,
  },
  edited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Create a message model
const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
