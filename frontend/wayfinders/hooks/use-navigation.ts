"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {NavigationService} from "@/lib/navigation-service"
import type {Route, RouteData, RouteStep} from "@/types/route"

export type {Route, RouteData, RouteStep}

export interface NavigationState {
  isNavigating: boolean
  currentStepIndex: number
  currentStep: RouteStep | null
  nextStep: RouteStep | null
  totalSteps: number
  distanceToNextWaypoint: number | null
  userPosition: [number, number] | null
  accuracy: number | null
  error: string | null
  isSpeaking: boolean
}

const initialState: NavigationState = {
  isNavigating: false,
  currentStepIndex: 0,
  currentStep: null,
  nextStep: null,
  totalSteps: 0,
  distanceToNextWaypoint: null,
  userPosition: null,
  accuracy: null,
  error: null,
  isSpeaking: false,
}

export function useNavigation() {
  const [state, setState] = useState<NavigationState>(initialState)
  const serviceRef = useRef<NavigationService | null>(null)
  const routeRef = useRef<Route | null>(null)
  const stepsRef = useRef<RouteStep[]>([])

  // Initialize service on mount
  useEffect(() => {
    serviceRef.current = new NavigationService()
    return () => {
      serviceRef.current?.stopTracking()
    }
  }, [])

  const getWaypointCoordinates = useCallback(
    (stepIndex: number): [number, number] | null => {
      const route = routeRef.current
      const steps = stepsRef.current
      if (!route || !steps[stepIndex]) return null

      const step = steps[stepIndex]
      const waypointIndex = step.way_points[1] // End waypoint of current step
      const coord = route.geometry.coordinates[waypointIndex]
      if (!coord) return null

      return [coord[1], coord[0]] // Convert [lng, lat] to [lat, lng]
    },
    []
  )

  const handlePositionUpdate = useCallback(
    (lat: number, lng: number, accuracy: number) => {
      const service = serviceRef.current
      const steps = stepsRef.current

      setState((prev) => {
        if (!prev.isNavigating) return prev

        const waypointCoords = getWaypointCoordinates(prev.currentStepIndex)
        if (!waypointCoords || !service) {
          return {...prev, userPosition: [lat, lng], accuracy}
        }

        const distance = service.calculateDistance(
          lat,
          lng,
          waypointCoords[0],
          waypointCoords[1]
        )

        let newStepIndex = prev.currentStepIndex
        let shouldSpeak = false

        // Check if we should advance to next step
        if (distance < service.ARRIVAL_DISTANCE_METERS) {
          if (prev.currentStepIndex < steps.length - 1) {
            newStepIndex = prev.currentStepIndex + 1
            service.resetSpokenFlag()
            shouldSpeak = true
          } else {
            // Arrived at destination
            service.speak("You have arrived at your destination")
            service.stopTracking()
            return {...initialState}
          }
        } else if (
          distance < service.TRIGGER_DISTANCE_METERS &&
          !service.hasSpoken()
        ) {
          shouldSpeak = true
        }

        // Speak instruction if needed
        if (shouldSpeak && steps[newStepIndex]) {
          service.markAsSpoken()
          service.speak(steps[newStepIndex].instruction)
        }

        const newWaypointCoords = getWaypointCoordinates(newStepIndex)
        const newDistance = newWaypointCoords
          ? service.calculateDistance(
            lat,
            lng,
            newWaypointCoords[0],
            newWaypointCoords[1]
          )
          : distance

        return {
          ...prev,
          userPosition: [lat, lng],
          accuracy,
          currentStepIndex: newStepIndex,
          currentStep: steps[newStepIndex] || null,
          nextStep: steps[newStepIndex + 1] || null,
          distanceToNextWaypoint: Math.round(newDistance),
        }
      })
    },
    [getWaypointCoordinates]
  )

  const handleError = useCallback((error: GeolocationPositionError) => {
    const errorMessages: Record<number, string> = {
      1: "Location permission denied. Please enable location access.",
      2: "Location unavailable. Please check your device settings.",
      3: "Location request timed out. Please try again.",
    }
    setState((prev) => ({
      ...prev,
      error: errorMessages[error.code] || "Unknown location error",
      isNavigating: false,
    }))
    serviceRef.current?.stopTracking()
  }, [])

  const startNavigation = useCallback(
    (routeData: RouteData) => {
      const service = serviceRef.current
      if (!service) return

      const route = routeData.route
      const steps = route?.properties?.segments?.[0]?.steps || []

      if (steps.length === 0) {
        setState((prev) => ({
          ...prev,
          error: "No navigation steps available",
        }))
        return
      }

      routeRef.current = route
      stepsRef.current = steps

      setState({
        isNavigating: true,
        currentStepIndex: 0,
        currentStep: steps[0],
        nextStep: steps[1] || null,
        totalSteps: steps.length,
        distanceToNextWaypoint: null,
        userPosition: null,
        accuracy: null,
        error: null,
        isSpeaking: false,
      })

      service.resetSpokenFlag()

      // Announce first instruction
      if (steps[0]) {
        service.speak(`Starting navigation. ${steps[0].instruction}`)
        service.markAsSpoken()
      }

      service.startTracking(handlePositionUpdate, handleError)
    },
    [handlePositionUpdate, handleError]
  )

  const stopNavigation = useCallback(() => {
    serviceRef.current?.stopTracking()
    routeRef.current = null
    stepsRef.current = []
    setState(initialState)
  }, [])

  const skipToNextStep = useCallback(() => {
    const service = serviceRef.current
    const steps = stepsRef.current

    setState((prev) => {
      if (prev.currentStepIndex >= steps.length - 1) return prev

      const newIndex = prev.currentStepIndex + 1
      service?.resetSpokenFlag()

      if (steps[newIndex]) {
        service?.speak(steps[newIndex].instruction)
        service?.markAsSpoken()
      }

      return {
        ...prev,
        currentStepIndex: newIndex,
        currentStep: steps[newIndex] || null,
        nextStep: steps[newIndex + 1] || null,
      }
    })
  }, [])

  const repeatCurrentInstruction = useCallback(() => {
    const service = serviceRef.current
    if (state.currentStep) {
      service?.speak(state.currentStep.instruction)
    }
  }, [state.currentStep])

  return {
    ...state,
    startNavigation,
    stopNavigation,
    skipToNextStep,
    repeatCurrentInstruction,
    isVoiceSupported: serviceRef.current?.isVoiceSupported() ?? false,
  }
}