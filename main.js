let APP_ID = "2a96c578ddbb4541984e6b79b53e7854"

let token = null;
let uid = "OR_JAV" + String(Math.floor(Math.random() * 1000))

let client;
let channel;

let queryString = window.location.search
let urlParams = new URLSearchParams(queryString)
let roomId = urlParams.get('room')

if (!roomId) {
    window.location = 'lobby.html'
}

let localStream;
let remoteStream;
let peerConnection;
let screenStream
let dataChannel
let canvas
let brush

canvas = new fabric.Canvas('canvas', {
    selection: false
});

canvas.wrapperEl.style.display = 'none';

// Set the canvas width and height to the window width and height
canvas.setWidth(window.innerWidth);
canvas.setHeight(window.innerHeight);

// Brush
brush = new fabric.PencilBrush(canvas);
brush.color = 'red';
brush.width = 10;

canvas.freeDrawingBrush = brush;

// Optionally, add an event listener to resize the canvas if the window size changes
window.addEventListener('resize', function () {
    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);
    canvas.renderAll();
});

canvas.on('path:created', function (e) {
    console.log("path:created: ", e)
    const data = JSON.stringify({
        type: 'annotation',
        path: e.path
    });
    if (dataChannel) {
        dataChannel.send(data);
    }
});

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
}

let constraints = {
    video: true,
    audio: true
}

let handleUserLeft = (MemberId) => {
    console.log("MEMBER LEFT: ", MemberId)
    document.getElementById('user-2').style.display = 'none'
    document.getElementById('user-1').classList.remove('smallFrame')
    canvas.wrapperEl.style.display = 'none';
}

let init = async () => {
    client = await AgoraRTM.createInstance(APP_ID)
    console.log("LOGIN USER: ", uid)
    await client.login({ uid })

    channel = client.createChannel(roomId)
    await channel.join()

    channel.on('MemberJoined', handleUserJoined)
    channel.on('MemberLeft', handleUserLeft)

    client.on('MessageFromPeer', handleMessageFromPeer)

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    document.getElementById('user-1').srcObject = localStream
}

let handleMessageFromPeer = async (message, MemberId) => {

    message = JSON.parse(message.text)

    if (message.type === 'offer') {
        console.log("CREATE ANSWER: ", message)
        createAnswer(MemberId, message.offer)
    }

    if (message.type === 'answer') {
        console.log("ADD ANSWER: ", message)
        addAnswer(message.answer)
    }

    if (message.type === 'candidate') {
        if (peerConnection) {
            peerConnection.addIceCandidate(message.candidate)
        }
    }
}

let handleUserJoined = async (MemberId) => {
    const result = confirm("Incoming Call");
    if (result === true) {
        console.log('A new user joined the channel:', MemberId)
        console.log("CREATE OFFER")
        createOffer(MemberId)
    } else {
        // The user clicked "Cancel"
        // Do nothing or perform some other action here
    }

}


let createPeerConnection = async (MemberId) => {
    peerConnection = new RTCPeerConnection(servers)
    // peerConnection = new RTCPeerConnection()

    window.SESSION = peerConnection

    remoteStream = new MediaStream()

    document.getElementById('user-2').srcObject = remoteStream
    document.getElementById('user-2').style.display = 'block'

    document.getElementById('user-1').classList.add('smallFrame')


    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        document.getElementById('user-1').srcObject = localStream
    }

    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
    })

    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track)
        })
    }

    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId)
        }
    }
}

let startDrawing = () => {
    canvas.isDrawingMode = true;
}

let stopDrawing = () => {
    canvas.isDrawingMode = false;
}

let createOffer = async (MemberId) => {
    await createPeerConnection(MemberId)

    await createDataChannel()

    let offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)

    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offer }) }, MemberId)
}

let createAnswer = async (MemberId, offer) => {
    await createPeerConnection(MemberId)

    // listen for a data channel on the peer connection
    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;

        // listen for the open event on the data channel
        dataChannel.onopen = () => {
            console.log('Data channel is now open and ready to use.');
        };

        // listen for the message event on the data channel
        dataChannel.onmessage = event => {
            console.log('Received message:', event.data);
            handleDataTransfer(event.data)
        };
    };


    await peerConnection.setRemoteDescription(offer)

    let answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answer }) }, MemberId)
    canvas.wrapperEl.style.display = '';
}


let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription) {
        peerConnection.setRemoteDescription(answer)
    }
}


let leaveChannel = async () => {
    await channel.leave()
    await client.logout()
}

let toggleCamera = async () => {
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video')

    if (videoTrack.enabled) {
        videoTrack.enabled = false
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(255, 80, 80)'
    } else {
        videoTrack.enabled = true
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)'
    }
}

let toggleMic = async () => {
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio')

    if (audioTrack.enabled) {
        audioTrack.enabled = false
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(255, 80, 80)'
    } else {
        audioTrack.enabled = true
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)'
    }
}

let handleDataTransfer = (_data) => {
    const data = JSON.parse(_data);
    console.log("DATA: ", data)
    
    if (data.type === 'annotation') {
        const path = new fabric.Path(data.path.path);

        path.set({
            stroke: data.path.stroke,
            strokeWidth: data.path.strokeWidth,
            fill: null
        });

        canvas.add(path);
        canvas.renderAll();
    }
}

let createDataChannel = async () => {
    // Send annotation data through WebRTC data channel
    dataChannel = peerConnection.createDataChannel('annotation-channel');

    dataChannel.onopen = () => {
        console.log('Data channel is now open and ready to use.');

        // send a message over the data channel
        dataChannel.send('Hello, world!');
        canvas.wrapperEl.style.display = '';
    };

    // listen for the message event on the data channel
    dataChannel.onmessage = e => {
        console.log('Received message:', e.data);
        handleDataTransfer(e.data)
    };
}

window.addEventListener('beforeunload', leaveChannel)

document.getElementById('camera-btn').addEventListener('click', toggleCamera)
document.getElementById('mic-btn').addEventListener('click', toggleMic)

init()