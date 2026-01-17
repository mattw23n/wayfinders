"use client"

import {Button} from "@/components/ui/button"
import {Navigation, SkipForward, Volume2, X} from "lucide-react"
import type {RouteStep} from "@/hooks/use-navigation"

interface NavigationOverlayProps {
  currentStepIndex: number
  totalSteps: number
  currentStep: RouteStep | null
  distanceToNextWaypoint: number | null
  accuracy: number | null
  onStop: () => void
  onSkip: () => void
  onRepeat: () => void
}

export function NavigationOverlay({
                                    currentStepIndex,
                                    totalSteps,
                                    currentStep,
                                    distanceToNextWaypoint,
                                    accuracy,
                                    onStop,
                                    onSkip,
                                    onRepeat,
                                  }: NavigationOverlayProps) {
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-3000 bg-background border border-border rounded-lg shadow-xl p-4 w-[calc(100%-2rem)] max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary animate-pulse"/>
          <span className="text-sm font-medium text-muted-foreground">
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onStop}
        >
          <X className="h-4 w-4"/>
        </Button>
      </div>

      {/* Current Instruction */}
      <p className="font-semibold text-lg leading-tight mb-2">
        {currentStep?.instruction || "Calculating..."}
      </p>

      {/* Street name if available */}
      {currentStep?.name && currentStep.name !== "-" && (
        <p className="text-sm text-muted-foreground mb-2">
          on {currentStep.name}
        </p>
      )}

      {/* Distance and accuracy */}
      <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
        <span>
          {distanceToNextWaypoint !== null
            ? `${distanceToNextWaypoint}m ahead`
            : "Calculating distance..."}
        </span>
        {accuracy !== null && (
          <span className="text-xs">
            GPS: ±{Math.round(accuracy)}m
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={onRepeat}
        >
          <Volume2 className="h-4 w-4 mr-1"/>
          Repeat
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={onSkip}
          disabled={currentStepIndex >= totalSteps - 1}
        >
          <SkipForward className="h-4 w-4 mr-1"/>
          Skip
        </Button>
      </div>
    </div>
  )
}