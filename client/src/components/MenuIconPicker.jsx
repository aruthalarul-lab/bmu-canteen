import React, { useState, useMemo } from 'react';
import { Search, Sparkles, Plus, Smile } from 'lucide-react';

export const ICON_CATEGORIES = [
  {
    id: 'popular',
    name: 'Top Picks',
    icon: '⭐',
    emojis: ['🍲', '🍛', '🥘', '🍗', '🥞', '🫓', '☕', '🥤', '🥪', '🍔', '🍕', '🥟', '🍟', '🍨', '🍜']
  },
  {
    id: 'meals',
    name: 'Meals & Curries',
    icon: '🍛',
    emojis: ['🍛', '🍲', '🥘', '🍗', '🥩', '🍖', '🍤', '🐟', '🥣', '🍱', '🧆', '🍚', '🍢']
  },
  {
    id: 'tiffin',
    name: 'Tiffin & Breakfast',
    icon: '🥞',
    emojis: ['🥞', '🫓', '🍳', '🥚', '🥟', '🥐', '🥯', '🍞', '🥪', '🧀']
  },
  {
    id: 'snacks',
    name: 'Fast Food & Snacks',
    icon: '🍔',
    emojis: ['🍔', '🍕', '🌯', '🌮', '🌭', '🍟', '🍿', '🥟', '🥨', '🥠', '🍘', '🍜', '🍝', '🌶️']
  },
  {
    id: 'beverages',
    name: 'Chai & Beverages',
    icon: '☕',
    emojis: ['☕', '🍵', '🥤', '🧃', '🧋', '🥛', '🧉', '🍹', '🍸', '🍾', '🧊', '🥥']
  },
  {
    id: 'desserts',
    name: 'Sweets & Bakery',
    icon: '🍨',
    emojis: ['🍨', '🍦', '🍧', '🍩', '🍪', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍯', '🍮']
  },
  {
    id: 'healthy',
    name: 'Fruits & Healthy',
    icon: '🥗',
    emojis: ['🥗', '🍎', '🍌', '🥭', '🍊', '🍉', '🍇', '🍓', '🍍', '🥑', '🥒', '🌽', '🥕', '🍋']
  }
];

export default function MenuIconPicker({ selectedEmoji, onSelectEmoji }) {
  const [activeCategory, setActiveCategory] = useState('popular');
  const [customEmoji, setCustomEmoji] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Collect all unique emojis across all categories
  const allUniqueEmojis = useMemo(() => {
    const set = new Set();
    ICON_CATEGORIES.forEach(cat => cat.emojis.forEach(e => set.add(e)));
    return Array.from(set);
  }, []);

  // Display emojis based on category or search
  const displayedEmojis = useMemo(() => {
    if (activeCategory === 'all') {
      return allUniqueEmojis;
    }
    const cat = ICON_CATEGORIES.find(c => c.id === activeCategory);
    return cat ? cat.emojis : allUniqueEmojis;
  }, [activeCategory, allUniqueEmojis]);

  const handleCustomApply = (e) => {
    e.preventDefault();
    if (customEmoji.trim()) {
      onSelectEmoji(customEmoji.trim());
      setCustomEmoji('');
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
      {/* Top Bar: Preview & Quick Category Filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-12 h-12 rounded-xl bg-white border-2 border-orange-400 shadow-sm flex items-center justify-center text-2xl select-none shrink-0 transition-transform transform hover:scale-105">
            {selectedEmoji || '🍲'}
          </div>
          <div>
            <div className="flex items-center space-x-1">
              <span className="text-xs font-bold text-slate-800">Selected Icon</span>
              <span className="text-[10px] bg-orange-100 text-orange-700 font-semibold px-1.5 py-0.5 rounded-full">Live Preview</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Pick from 85+ icons below or paste any custom emoji
            </p>
          </div>
        </div>

        {/* Custom Emoji / Text Input */}
        <form onSubmit={handleCustomApply} className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder="Custom icon..."
              value={customEmoji}
              maxLength={4}
              onChange={(e) => setCustomEmoji(e.target.value)}
              className="w-24 sm:w-28 text-center text-xs py-1.5 px-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-orange-500 font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={!customEmoji.trim()}
            className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors"
            title="Apply custom emoji"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveCategory('popular')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1 ${
            activeCategory === 'popular'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <span>⭐</span>
          <span>Top Picks</span>
        </button>

        {ICON_CATEGORIES.filter(c => c.id !== 'popular').map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1 ${
              activeCategory === cat.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.name}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center space-x-1 ${
            activeCategory === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <span>✨</span>
          <span>All ({allUniqueEmojis.length})</span>
        </button>
      </div>

      {/* Emoji Grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 max-h-36 overflow-y-auto">
        <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
          {displayedEmojis.map(emoji => {
            const isSelected = selectedEmoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelectEmoji(emoji)}
                className={`w-9 h-9 text-xl rounded-xl flex items-center justify-center transition-all select-none ${
                  isSelected
                    ? 'bg-orange-100 border-2 border-orange-500 scale-110 shadow-sm'
                    : 'bg-slate-50 hover:bg-orange-50 hover:border-orange-200 border border-slate-200/80 hover:scale-105'
                }`}
                title={`Select ${emoji}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
