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
- Profile picture shared with connected friends
- Light/dark appearance, customizable chat color, display name, and notification sounds
- One-to-one voice and video calls

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
4. Select **Enter** to open the app; no name is needed on the welcome screen. Use the gear button to set your display name, profile picture, chat color, light/dark appearance, and notification sounds. Your name is saved as you type; other preferences are saved with **Save settings**.
5. Start a one-to-one voice or video call with the phone or camera buttons in a direct chat. Allow microphone/camera access when prompted; video calls require a supported browser and a secure context (HTTPS or localhost).

Groups use a peer-to-peer mesh: members relay group messages to other connected members. There is no central chat server, so all members need to be online and connected for messages to reach across the group; chat history is local to each device. PeerJS IDs may change between visits, so share your current ID when reconnecting or adding a member.

Voice and video are peer-to-peer using WebRTC through PeerJS. Network/firewall restrictions can prevent a direct media connection; this app does not currently provide a TURN relay service.

## Install on phone

- Android: Chrome → Install app
- iPhone: Safari → Share → Add to Home Screen
