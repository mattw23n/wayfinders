type PositionCallback = (lat: number, lng: number, accuracy: number) => void
type ErrorCallback = (error: GeolocationPositionError) => void

export class NavigationService {
  readonly TRIGGER_DISTANCE_METERS = 30
  readonly ARRIVAL_DISTANCE_METERS = 10
  private watchId: number | null = null
  private synthesis: SpeechSynthesis | null = null
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private hasSpokenCurrentStep: boolean = false

  constructor() {
    if (typeof window !== "undefined") {
      this.synthesis = window.speechSynthesis
    }
  }

  startTracking(onPosition: PositionCallback, onError?: ErrorCallback): void {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onError?.({
        code: 2,
        message: "Geolocation not supported",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError)
      return
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        onPosition(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        )
      },
      (error) => {
        onError?.(error)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  stopTracking(): void {
    if (this.watchId !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    this.cancelSpeech()
  }

  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000 // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1)
    const dLng = this.toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
      Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        resolve()
        return
      }

      this.cancelSpeech()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0
      utterance.lang = "en-US"

      utterance.onend = () => {
        this.currentUtterance = null
        resolve()
      }

      utterance.onerror = (event) => {
        this.currentUtterance = null
        if (event.error === "canceled") {
          resolve()
        } else {
          reject(new Error(event.error))
        }
      }

      this.currentUtterance = utterance
      this.synthesis.speak(utterance)
    })
  }

  cancelSpeech(): void {
    if (this.synthesis) {
      this.synthesis.cancel()
    }
    this.currentUtterance = null
  }

  isVoiceSupported(): boolean {
    return this.synthesis !== null
  }

  resetSpokenFlag(): void {
    this.hasSpokenCurrentStep = false
  }

  markAsSpoken(): void {
    this.hasSpokenCurrentStep = true
  }

  hasSpoken(): boolean {
    return this.hasSpokenCurrentStep
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180)
  }
}