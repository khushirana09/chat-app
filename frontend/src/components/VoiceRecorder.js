import React, { useEffect, useRef, useState } from "react";
import { FaMicrophone, FaStop, FaPaperPlane } from "react-icons/fa";

function formatDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
    const s = Math.floor(totalSeconds % 60)
        .toString()
        .padStart(2, "0");
    return `${m}:${s}`;
}

// Records a short voice clip using the browser's native MediaRecorder API
// (no external library needed) and hands the finished Blob back to the
// parent via onRecorded, exactly like handleFileUpload does for attachments.
function VoiceRecorder({ onRecorded, onRecordingChange }) {
    const [isRecording, setIsRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [error, setError] = useState("");

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const timerRef = useRef(null);

    // Safety net: if the component unmounts mid-recording (e.g. the user
    // switches conversations), make sure the microphone actually gets
    // released instead of staying on in the background.
    useEffect(() => {
        return () => {
            clearInterval(timerRef.current);
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const startRecording = async () => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                // Use the recorder's own mimeType (Chrome: audio/webm, Safari:
                // audio/mp4, etc.) rather than hardcoding one, so playback works
                // consistently across browsers.
                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || "audio/webm",
                });
                stream.getTracks().forEach((track) => track.stop()); // release the mic
                onRecorded(blob);
            };

            recorder.start();
            setIsRecording(true);
            onRecordingChange?.(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch (err) {
            console.error("Microphone access failed:", err);
            setError("Couldn't access your microphone — check your browser permissions.");
        }
    };

    const stopAndSend = () => {
        clearInterval(timerRef.current);
        setIsRecording(false);
        onRecordingChange?.(false);
        mediaRecorderRef.current?.stop(); // triggers onstop above, which calls onRecorded
    };

    const cancelRecording = () => {
        clearInterval(timerRef.current);
        setIsRecording(false);
        onRecordingChange?.(false);

        // Swap onstop first so stopping here releases the mic WITHOUT
        // uploading/sending the half-finished clip.
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = () => {
                streamRef.current?.getTracks().forEach((track) => track.stop());
            };
            mediaRecorderRef.current.stop();
        }
    };

    return (
        <>
            {!isRecording && (
                <button
                    type="button"
                    className="wa-icon-btn"
                    onClick={startRecording}
                    title="Record a voice message"
                >
                    <FaMicrophone />
                </button>
            )}

            {isRecording && (
                <div className="voice-recorder-overlay">
                    <button
                        type="button"
                        className="voice-recorder-cancel"
                        onClick={cancelRecording}
                        title="Cancel"
                    >
                        ✕
                    </button>
                    <span className="voice-recorder-dot" aria-hidden="true"></span>
                    <span className="voice-recorder-time">{formatDuration(seconds)}</span>
                    <button
                        type="button"
                        className="voice-recorder-send"
                        onClick={stopAndSend}
                        title="Stop and send"
                    >
                        <FaStop /> <FaPaperPlane />
                    </button>
                </div>
            )}

            {error && <div className="voice-recorder-error">{error}</div>}
        </>
    );
}

export default VoiceRecorder;