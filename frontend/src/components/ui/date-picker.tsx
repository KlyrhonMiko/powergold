"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

export interface DatePickerProps {
    date?: Date
    onChange?: (date: Date | undefined) => void
    placeholder?: string
    disabled?: boolean
}

export function DatePicker({ date, onChange, placeholder = "Pick a date", disabled = false }: DatePickerProps) {
    return (
        <Popover>
            <PopoverTrigger
                disabled={disabled}
                className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-full justify-start text-left font-normal h-11 px-3.5 rounded-xl bg-muted/50 border-border hover:bg-muted transition-all active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed",
                    !date && "text-muted-foreground"
                )}
            >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : <span>{placeholder}</span>}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={onChange}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    )
}
