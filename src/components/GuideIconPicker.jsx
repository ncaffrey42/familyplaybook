import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import GuideIcon from '@/components/GuideIcon';
import { ScrollArea } from '@/components/ui/scroll-area';

const emojiCategories = {
  "People": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "😉", "😍", "🥰", "😘", "😋", "😛", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😭", "🤯", "😴", "👨‍👩‍👧‍👦", "🤷", "👨‍🏫", "👩‍🍳", "👨‍💻", "👩‍🎨"],
  "Nature": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🦋", "🐛", "🐌"],
  "Food": ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳"],
  "Objects": ["💡", "💻", "📱", "⌚️", "📷", "🔌", "🔋", "🔑", "❤️", "🔥", "⭐️", "🎉", "🎁", "📚", "✏️", "🗑", "🧹", "🧼", "🧽", "🪣", "🔧", "🔨", "🔩", "⚙️", "💰", "💳", "💎", "⚗️", "🔬", "🔭", "💊"],
  "Activities": ["⚽️", "🏀", "🏈", "⚾️", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🥅", "⛳️", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸", "🥌", "🎿", "⛷", "🏂", "🏋️‍♀️", "🤸‍♀️"],
};

const standardIcons = [
  "FileText", "Book", "BookOpen", "Heart", "Star", "Home", "Zap", "Activity", 
  "Map", "Compass", "Coffee", "Music", "Camera", "Image", "Video", "Mic",
  "Smile", "ThumbsUp", "Flag", "Bell", "Calendar", "Clock", "Cloud", "Sun",
  "Moon", "Umbrella", "Key", "Lock", "Unlock", "Shield", "Award", "Gift"
];

const GuideIconPicker = ({ icon, setIcon, trigger }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleIconSelect = (newIcon) => {
    setIcon(newIcon);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger ? (
           trigger 
        ) : (
          <Button
            variant="outline"
            className="w-20 h-20 p-0 bg-gray-100 dark:bg-gray-800/50 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border-2 border-dashed border-gray-200 dark:border-gray-700"
          >
            <GuideIcon iconName={icon} className="w-full h-full bg-transparent" size={32} />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Tabs defaultValue="Icons" className="w-full">
          <div className="p-3 pb-0">
            <TabsList className="grid w-full grid-cols-5 h-auto gap-1 bg-transparent">
              <TabsTrigger value="Icons" className="text-xs px-1 py-1.5 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 rounded-md">Icons</TabsTrigger>
               {Object.keys(emojiCategories).slice(0, 4).map(category => (
                   <TabsTrigger key={category} value={category} className="text-xs px-1 py-1.5 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 rounded-md">
                     {emojiCategories[category][0]}
                   </TabsTrigger>
               ))}
            </TabsList>
          </div>

          <ScrollArea className="h-[280px] w-full p-3">
            <TabsContent value="Icons" className="mt-0">
              <div className="grid grid-cols-6 gap-2">
                {standardIcons.map(iconName => (
                  <Button
                    key={iconName}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    onClick={() => handleIconSelect(iconName)}
                    title={iconName}
                  >
                    <GuideIcon iconName={iconName} size={20} className="bg-transparent w-8 h-8" />
                  </Button>
                ))}
              </div>
            </TabsContent>

            {Object.keys(emojiCategories).map(category => (
                 <TabsContent key={category} value={category} className="mt-0">
                    <div className="grid grid-cols-6 gap-2">
                        {emojiCategories[category].map(emoji => (
                        <Button
                            key={emoji}
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-xl hover:bg-purple-50 dark:hover:bg-purple-900/20"
                            onClick={() => handleIconSelect(emoji)}
                        >
                            {emoji}
                        </Button>
                        ))}
                    </div>
                </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

export default GuideIconPicker;