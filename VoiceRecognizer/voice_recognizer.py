import webrtcvad
import collections
import stt
import numpy as np
from scipy import signal
from halo import Halo

import queue

from aiortc import MediaStreamTrack
from av.audio.resampler import AudioResampler

MODEL = 'VoiceRecognizer/model.tflite'
SCORER = 'VoiceRecognizer/scorer.scorer'

class DetectionAudio(MediaStreamTrack):

    kind = "audio"
    RATE_PROCESS = 16000
    
    def __init__(self, track, peer_conn):
        super().__init__() # Important
        self.track = track
        self.peer_conn = peer_conn

        self.vad = webrtcvad.Vad(3) # VAD of strength 3. It separes noise from voice.
        
        self.resampler = AudioResampler("s16", "mono") # To resample audio

        self.input_rate = None # Sample rate of input audio
        self.sample_rate = self.RATE_PROCESS # Desired sample rate
        self.ratio = 0.6 # Ratio for detection
        self.buffer_queue = queue.Queue() # Buffer for new frames

        self.model = stt.Model(MODEL) # Deep Learning model
        self.model.enableExternalScorer(SCORER) # Deep Learning scorer

        frame_duration_ms = 20 # Duration of each frame in ms
        padding_duration_ms = 300 # Duration of whole padding in ms
        num_padding_frames = padding_duration_ms // frame_duration_ms # Number of frames per padding

        # Queue to store frames with is_speech result to process complete paddings
        self.ring_buffer = collections.deque(maxlen=num_padding_frames)
        self.triggered = False

        self.spinner = Halo(spinner='line') # To create an animation while recognition
        self.stream_context = self.model.createStream() # Model for recognition

        # Receives audio datachannel
        @peer_conn.on("datachannel")
        def on_datachannel(channel):
            if channel.label == "audio_channel": # Filter to get only audio
                self.data_channel = channel
                @channel.on("message")
                def on_message(message): # On received message, print it
                    print(message)

    # Object detector program
    # Activates for every new frame
    async def recv(self):
        frame = await self.track.recv() # Receives frame
        self.input_rate = frame.sample_rate # Sets sample rate of received frame
        frame = self.resampler.resample(frame) # Resample frame to make it 'mono'
        self.buffer_queue.put(frame.planes[0].to_bytes()) # Puts frame's bytes inside buffer
        self.detect() # Starts detection

    # Resample a frame to 16000 Hz
    # Used to complete previous resampling
    def resample(self, data):
        data16 = np.fromstring(string=data, dtype=np.int16) # Converts string to 1-D array
        resample_size = int(len(data16) / self.input_rate * self.RATE_PROCESS) # Gets size of resample
        resample = signal.resample(data16, resample_size) # Performs resample to array
        resample16 = np.array(resample, dtype=np.int16) # Converts 1-D array into a normal array
        return resample16.tostring() # Returns string from array

    # Resample frames which needs resample
    def frame_generator(self):
        if self.input_rate == self.RATE_PROCESS:
            return self.buffer_queue.get()
        else: # Resample performed in case of different sample rate
            return self.resample(self.buffer_queue.get())

    # Gets when user is speaking or it is just noise
    def vad_collector(self):
        frame = self.frame_generator() # Gets frame

        is_speech = self.vad.is_speech(frame, self.sample_rate) # Determines if frame contains speech or noise

        frames = []
        if not self.triggered:
            self.ring_buffer.append((frame, is_speech)) # Adds to buffer frame with is_speech result
            num_voiced = len([f for f, speech in self.ring_buffer if speech]) # Counts how many voiced frames exists
            if num_voiced > self.ratio * self.ring_buffer.maxlen: # A lot of voice, it is a sentence
                self.triggered = True
                for f, s in self.ring_buffer:
                    frames.append(f) # Appends everything to return it
                self.ring_buffer.clear() # Clear buffer
        else: # Executed when a sentence is determined
            frames.append(frame) # Returns every frame
            self.ring_buffer.append((frame, is_speech)) # Adds every frame and is_speech result to buffer
            num_unvoiced = len([f for f, speech in self.ring_buffer if not speech]) # Counts how many non voiced frames exists
            if num_unvoiced > self.ratio * self.ring_buffer.maxlen: # A lot of silence or noise, sentence has finished
                self.triggered = False
                frames.append(None) # Append None to point the end of the sentence
                self.ring_buffer.clear() # Clear buffer
                    
        return frames

    # Detection of commands is performed
    def detect(self):
        frames = self.vad_collector() # Get frames with a sentence
        for frame in frames:
            if frame is not None: # If it is not none, is part of the sentence
                self.spinner.start() # Starts animation of performing
                self.stream_context.feedAudioContent(np.frombuffer(frame, np.int16)) # Introduce frame to recognizer
            else:
                self.spinner.stop() # Stops recognising animation
                text = self.stream_context.finishStream() # Gets recognized command
                if self.data_channel is not None:
                    self.data_channel.send(text) # Send result through datachannel
                print("Recognized: %s" % text)
                self.stream_context = self.model.createStream() # Create new stream for recognition
