import { useState, useEffect, useCallback } from 'react';
import { MediaDeviceOption } from '../types';

export function useMediaDevices() {
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }

    try {
      setIsLoading(true);
      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoList: MediaDeviceOption[] = [];
      const audioList: MediaDeviceOption[] = [];

      let camIndex = 1;
      let micIndex = 1;

      devices.forEach((dev) => {
        if (dev.kind === 'videoinput') {
          videoList.push({
            deviceId: dev.deviceId,
            label: dev.label || `Câmera ${camIndex++}`,
            kind: 'videoinput',
          });
        } else if (dev.kind === 'audioinput') {
          audioList.push({
            deviceId: dev.deviceId,
            label: dev.label || `Microfone ${micIndex++}`,
            kind: 'audioinput',
          });
        }
      });

      setCameras(videoList);
      setMicrophones(audioList);
    } catch (err) {
      console.warn('Erro ao enumerar dispositivos de mídia:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  return {
    cameras,
    microphones,
    isLoading,
    refreshDevices,
  };
}
