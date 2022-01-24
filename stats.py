import asyncio
import json
import os
import math

from datetime import datetime

SLEEP_TIME = 1 # In seconds

FILE_NAME = './Results/results_pc'
JSON = '.json'

BYTES_PREV = 'bytesPrev'
TIMESTAMP_PREV = 'timestampPrev'

TIMESTAMP_KEY = 'timestamp'
REMOTE_TIMESTAMP_KEY = 'remoteTimestamp'

BITRATE = 'bitrate'
BITRATE_UNIT = ' kbits/sec'

def naming(num):
    # Returns file name with path
    return FILE_NAME + str(num) + JSON

async def periodic(peer_conns):
    # Get stats every X seconds. Equivalent to setIterval of JavaScript
    remove_results_files() # Remove all files to not overwrite and mix results
    bitrate_stats = {
        BYTES_PREV: 0,
        TIMESTAMP_PREV: 0
    }

    while True: # Infinite loop
        for peer_conn in peer_conns:
            file_name = naming(peer_conns[peer_conn])
            with open(file_name, 'a') as f:
                # Opens file to write stats
                show_stats(await peer_conn.getStats(), bitrate_stats, f)
        await asyncio.sleep(SLEEP_TIME) #Wait X seconds

def remove_results_files():
    # Delete all results files
    i = 0
    while os.path.exists(naming(i)):
        os.remove(naming(i))
        i += 1

def show_stats(results, bitrate_stats, file):
    # Write stats directly on file
    dict_reports = dict()
    # Calculate bitrate and adds to dict
    dict_reports[BITRATE] = calculate_bitRate(results, bitrate_stats)

    for report in results:
        # Take each report from results to add to dict
        dict_report = results[report].__dict__

        # Timestamp and remote Timestamp has a format that has to be converted into a simple int
        if TIMESTAMP_KEY in dict_report.keys():
            if isinstance(dict_report[TIMESTAMP_KEY], datetime):
                dict_report[TIMESTAMP_KEY] = datetime.timestamp(dict_report[TIMESTAMP_KEY])

        if REMOTE_TIMESTAMP_KEY in dict_report.keys():
            if isinstance(dict_report[REMOTE_TIMESTAMP_KEY], datetime):
                dict_report[REMOTE_TIMESTAMP_KEY] = datetime.timestamp(dict_report[REMOTE_TIMESTAMP_KEY])

        dict_reports[report] = dict_report

    json.dump(dict_reports, file) # Write dict as a json in file
    file.write(', ') # Add , to separate each dict for each result taken every X seconds

def calculate_bitRate(results, bitrate_stats):
    # Calculate bitrate given a results dict
    bitrate = 0
    for report in results:
        # For each report, take timestamp
        now = datetime.timestamp(results[report].timestamp) if isinstance(results[report].timestamp, datetime) else results[report].timestamp

        if results[report].type == 'remote-outbound-rtp' and results[report].kind == 'video':
            # Only needed reports: remote outbound rtp and type video (video streaming from client to server)
            bytes = results[report].bytesSent
            if bitrate_stats[TIMESTAMP_PREV] and now > bitrate_stats[TIMESTAMP_PREV]:
                # Calculate bitrate if report taken is newer than previous
                bitrate = 8 * (bytes - bitrate_stats[BYTES_PREV]) / (now - bitrate_stats[TIMESTAMP_PREV])
                bitrate = math.floor(bitrate / 1000)

            # Update previous bytes and timestamp 
            bitrate_stats[BYTES_PREV] = bytes
            bitrate_stats[TIMESTAMP_PREV] = now
            
    bitrate = str(bitrate) + BITRATE_UNIT # Convert into str and add unit
    return bitrate
