
'use client';

import * as React from 'react'; // Added import React
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Dispatch, SetStateAction } from 'react';

interface StarRatingProps {
  rating: number;
  setRating?: Dispatch<SetStateAction<number>>;
  totalStars?: number;
  size?: number;
  fillColor?: string;
  emptyColor?: string;
  className?: string;
  readOnly?: boolean;
  hoverColor?: string;
}

export const StarRating = ({
  rating,
  setRating,
  totalStars = 5,
  size = 24,
  fillColor = 'hsl(var(--primary))', // Neon Blue for user context
  emptyColor = 'hsl(var(--muted-foreground))',
  className,
  readOnly = false,
  hoverColor = 'hsl(var(--accent))', // Neon Green for hover
}: StarRatingProps) => {
  const [hoverRating, setHoverRating] = React.useState(0);

  const handleMouseOver = (index: number) => {
    if (readOnly || !setRating) return;
    setHoverRating(index);
  };

  const handleMouseLeave = () => {
    if (readOnly || !setRating) return;
    setHoverRating(0);
  };

  const handleClick = (index: number) => {
    if (readOnly || !setRating) return;
    setRating(index);
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {[...Array(totalStars)].map((_, i) => {
        const starValue = i + 1;
        let starFillColor = emptyColor;
        let isFilled = false;

        if (hoverRating >= starValue) {
          starFillColor = hoverColor;
          isFilled = true;
        } else if (!hoverRating && rating >= starValue) {
          starFillColor = fillColor;
          isFilled = true;
        }
        
        return (
          <Star
            key={starValue}
            size={size}
            className={cn(
              'cursor-pointer transition-colors',
              readOnly && 'cursor-default'
            )}
            fill={isFilled ? starFillColor : 'none'}
            stroke={starFillColor}
            onMouseOver={() => handleMouseOver(starValue)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(starValue)}
            aria-label={`Rate ${starValue} out of ${totalStars} stars`}
          />
        );
      })}
    </div>
  );
};

