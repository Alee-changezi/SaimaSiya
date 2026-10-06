# Saima Siya

Advanced peer-to-peer messaging app.

**Live app:** https://alee-changezi.github.io/SaimaSiya/

## Features

- Real-time text messaging
- Group chats with live peer-to-peer message relaying
- Editable chat names and pictures
- File sharing (images + documents)
- Voice calls & Video calls
- Status / Stories (24 hours)
- **Friends list** (saved on your device)
- One-click reconnect to friends
- Online / Offline status
- Chat history (saved locally)
- Typing indicators & read receipts
- Installable on phone (PWA)
- Settings for display name, accent color, and notification sounds

## How to run

```bash
python3 -m http.server 3000
```

Open http://localhost:3000

## How to use Friends

1. Enter a friend’s Peer ID
2. Optionally enter their name
3. Click **Add & Connect**
4. They are saved in your Friends list
5. Next time just click them to reconnect

## Group chats and settings

1. Connect to friends using their current Peer IDs.
2. Select **New group**, enter a group name and one or more Peer IDs separated by commas, then create it.
3. Group members can add others and edit the group name and picture with the pencil button in the chat.
4. Use the gear button to change your display name, accent color, and notification sounds. Group details and preferences are saved on your device.

Groups use a peer-to-peer mesh: members relay group messages to other connected members. There is no central chat server, so all members need to be online and connected for messages to reach across the group; chat history is local to each device. PeerJS IDs may change between visits, so share your current ID when reconnecting or adding a member.

## Install on phone

- Android: Chrome → Install app
- iPhone: Safari → Share → Add to Home Screen
