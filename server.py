import asyncio
import json
import logging
import os
import ssl
import uuid
import threading

from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaBlackhole
from ObjectDetector.deteccion_video import DetectionVideo
from VoiceRecognizer.voice_recognizer import DetectionAudio
from stats import periodic

ROOT = os.path.dirname(__file__)

logger = logging.getLogger("peer_conn")
peer_conns = dict() # Store every peer connection

html_urls = { # Endpoints for different webpages
    "/": "WebXRSite/public/hololens.html"
}

async def html(request):
    # Create paths for each endpoint
    content = open(os.path.join(ROOT, html_urls[str(request.rel_url)]), "r", encoding="utf8").read()
    return web.Response(content_type="text/html", text=content)

async def offer(request):
    # Offer requested from client
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    peer_conn = RTCPeerConnection() # Creates peer connection and ID
    peer_conn_id = "PeerConnection(%s)" % uuid.uuid4()
    if not peer_conns.get(peer_conn): # Adds peer connection to dict
        peer_conns[peer_conn] = len(peer_conns)

    def log_info(msg, *args):
        logger.info(peer_conn_id + " " + msg, *args)

    log_info("Created for %s", request.remote)

    @peer_conn.on("iceconnectionstatechange")
    async def on_iceconnectionstatechange():
        # Change on ICE connection state
        log_info("ICE connection state is %s", peer_conn.iceConnectionState)
        if peer_conn.iceConnectionState == "failed":
            await peer_conn.close()
            if peer_conns.get(peer_conn): # Delete the peer connection after closing
                peer_conns.pop(peer_conn)

    @peer_conn.on("track")
    async def on_track(track):
        # Receives a track
        log_info("Track %s received", track.kind)
        blackHole = MediaBlackhole() # Redirects to trash for MediaStreamTrack to recognize and executes recv method
                                     # It could be redirected back again to the client, but we don't want it
        if track.kind == "audio":
            # In case of audio track, create audio recognizer element
            local_audio = DetectionAudio(track, peer_conn)
            blackHole.addTrack(local_audio) # Add track to black hole to execute recv method
            await blackHole.start()
        elif track.kind == "video":
            # In case of video track, create video recognizer element
            local_video = DetectionVideo(track, peer_conn)
            blackHole.addTrack(local_video) # Add track to black hole to execute recv method
            await blackHole.start()

        @track.on("ended")
        async def on_ended():
            # Stops black hole on ending
            await blackHole.stop()
            log_info("Track %s ended", track.kind)

    # Handle offer
    await peer_conn.setRemoteDescription(offer)

    # Send answer
    answer = await peer_conn.createAnswer()
    await peer_conn.setLocalDescription(answer)

    return web.Response(
        content_type="application/json",
        text=json.dumps(
            {"sdp": peer_conn.localDescription.sdp, "type": peer_conn.localDescription.type}
        ),
    )


async def on_shutdown(app):
    # Close and delete peer connections
    coros = [peer_conn.close() for peer_conn in peer_conns]
    await asyncio.gather(*coros)
    peer_conns.clear()

if __name__ == "__main__":
    cert_file = "WebXRSite/certs/cert.pem"
    key_file = "WebXRSite/certs/key.pem"
    ssl_context = ssl.SSLContext() # Load cert and key for SSL protocol (HTTPS)
    ssl_context.load_cert_chain(cert_file, key_file)

    # Create web application and add all routes
    app = web.Application()
    app.on_shutdown.append(on_shutdown)
    app.router.add_post("/offer", offer)
    for key in html_urls.keys():
        app.router.add_get(key, html)

    # Static route to get all assets and methods for web
    app.router.add_static('/WebXRSite', "WebXRSite")

    # Run web app on a thread, to get concurrency
    m = threading.Thread(target=web.run_app, kwargs={'app': app, 'access_log': None, 'port': 8080, 'ssl_context': ssl_context})
    m.daemon = True # Stops on shutdown
    m.start()

    # Run stats gatherer async
    asyncio.run(asyncio.sleep(3))
    asyncio.run(periodic(peer_conns))
