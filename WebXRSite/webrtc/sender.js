import { ip_address } from "../utils/constants.js";

// peer connection
var peer_conn = null;

// Creates the peer connection
function createPeerConnection() {
    var config = {
        sdpSemantics: 'unified-plan' // Previous plan B is in process of disappearance
    };

    // config.iceServers = [{urls: ['stun:stun.l.google.com:19302']}];

    peer_conn = new RTCPeerConnection(config);

    return peer_conn;
}

// Negotiation between peers
function negotiate() {
    return peer_conn.createOffer().then(function(offer) {
        return peer_conn.setLocalDescription(offer);
    }).then(function() {
        // wait for ICE gathering to complete
        return new Promise(function(resolve) {
            if (peer_conn.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (peer_conn.iceGatheringState === 'complete') {
                        peer_conn.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                peer_conn.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function() {
        var offer = peer_conn.localDescription;

        // Perform a POST over the IP address in which the other peer is located.
        return fetch('https://' + ip_address +':8080/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function(response) {
        return response.json();
    }).then(function(answer) {
        return peer_conn.setRemoteDescription(answer);
    }).catch(function(e) {
        alert(e);
    });
}

export const detectedObjs = []
export const recognizedCommands = []

// Start the communication
function start() {
    peer_conn = createPeerConnection();

    // Creates a datachannel for the video streaming
    var video_channel = peer_conn.createDataChannel('video_channel');
    video_channel.onclose = function () {
        console.log("Video channel closed");
        video_channel.send("Video channel closed");
    };
    video_channel.onopen = function () {
        console.log("Video channel opened");
        video_channel.send("Video channel opened");
    };
    video_channel.onmessage = function (evt) {
        console.log("Video: " + evt.data);
        detectedObjs.push(evt.data); // Messages received are results from object recognition
    };

    // Creates a datachannel for the audio streaming
    var audio_channel = peer_conn.createDataChannel('audio_channel');
    audio_channel.onclose = function () {
        console.log("Audio channel closed");
        audio_channel.send("Audio channel closed");
    };
    audio_channel.onopen = function () {
        console.log("Audio channel opened");
        audio_channel.send("Audio channel opened");
    };
    audio_channel.onmessage = function (evt) {
        console.log("Audio: " + evt.data);
        recognizedCommands.push(evt.data); // Messages received are results from voice recognition
    };

    var constraints = {
        audio: true,
        video: {
            frameRate: 30,
            width: {
                min: 720, ideal: 1080, max: 1440
            },
            aspectRatio: 1.77778 // 16:9
        },
    };

    // Gets user media devices (microphone and camera)
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        stream.getTracks().forEach(function(track) { // Gets every track
            peer_conn.addTrack(track, stream); // Adds track from device to peer connection
        });
        return negotiate();
    }, function(err) {
        alert('Could not acquire media: ' + err);
    });
}

function stop() {
    // close transceivers
    if (peer_conn.getTransceivers) {
        peer_conn.getTransceivers().forEach(function(transceiver) {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    // close local audio / video
    peer_conn.getSenders().forEach(function(sender) {
        sender.track.stop();
    });

    // close peer connection
    setTimeout(function() {
        peer_conn.close();
    }, 500);
}

// Start 3 seconds after the application
setTimeout(() => {
    start()
}, 3000)
