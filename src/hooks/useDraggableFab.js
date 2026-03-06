import { useState, useEffect, useRef } from 'react';
import { useDragControls, useMotionValue } from 'framer-motion';

const FAB_POSITION_KEY = 'fab_position';

const getDefaultPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 300, y: 500 }; // Default for SSR
  }
  return { x: window.innerWidth - 80, y: window.innerHeight - 180 };
};

export const useDraggableFab = () => {
  const [isDragging, setIsDragging] = useState(false);
  const fabRef = useRef(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    let storedPosition;
    try {
        storedPosition = JSON.parse(localStorage.getItem(FAB_POSITION_KEY));
    } catch(e) {
        console.error("Failed to parse FAB position from localStorage", e);
    }
    
    const initialPosition = storedPosition || getDefaultPosition();
    
    const boundedX = Math.max(0, Math.min(initialPosition.x, window.innerWidth - 64));
    const boundedY = Math.max(0, Math.min(initialPosition.y, window.innerHeight - 64 - 96));

    x.set(boundedX);
    y.set(boundedY);

    const handleResize = () => {
      const currentX = x.get();
      const currentY = y.get();
      const newX = Math.min(currentX, window.innerWidth - 64);
      const newY = Math.min(currentY, window.innerHeight - 64 - 96);
      x.set(newX);
      y.set(newY);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const savePosition = () => {
    localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
  };

  return {
    fabRef,
    isDragging,
    fabProps: {
      style: { x, y, position: 'fixed', touchAction: 'none' },
      drag: true,
      dragConstraints: {
        left: 0,
        right: typeof window !== 'undefined' ? window.innerWidth - 64 : 0,
        top: 0,
        bottom: typeof window !== 'undefined' ? window.innerHeight - 64 - 96 : 0,
      },
      dragMomentum: false,
      onDragStart: () => setIsDragging(true),
      onDragEnd: () => {
        setTimeout(() => setIsDragging(false), 50); // a small delay to distinguish drag from tap
        savePosition();
      },
    },
  };
};