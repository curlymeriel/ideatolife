import React, { useState } from 'react';
import { FolderInput, X } from 'lucide-react';

interface ProfileNameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string, isDirect: boolean) => void;
}

export const ProfileNameModal: React.FC<ProfileNameModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [name, setName] = useState('');
    const [isDirect, setIsDirect] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!isDirect) {
            const trimmed = name.trim();
            if (!trimmed) {
                setError('Profile name cannot be empty');
                return;
            }

            // Simple sanitization for folder name safety
            if (/[<>:"/\\|?*]/.test(trimmed)) {
                setError('Name contains invalid characters');
                return;
            }
            onConfirm(trimmed, false);
        } else {
            // Direct connection: name is ignored
            onConfirm("", true);
        }

        setName('');
        setError('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <FolderInput className="w-5 h-5 text-blue-400" />
                        Set Profile Name
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-800"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm text-gray-400">
                            Enter a name for this profile (e.g., 'Work', 'Personal').
                            A subfolder with this name will be created to keep your data separate.
                        </p>

                        <div className="relative">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (error) setError('');
                                }}
                                disabled={isDirect}
                                placeholder="e.g. Personal"
                                className={`w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all ${isDirect ? 'opacity-30 cursor-not-allowed' : ''}`}
                                autoFocus={!isDirect}
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 font-medium animate-pulse">
                                {error}
                            </p>
                        )}
                    </div>

                    {/* Direct Connection Toggle */}
                    <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="pt-0.5">
                            <input
                                type="checkbox"
                                id="direct-mode"
                                checked={isDirect}
                                onChange={(e) => {
                                    setIsDirect(e.target.checked);
                                    if (e.target.checked) setError('');
                                }}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500/50 cursor-pointer"
                            />
                        </div>
                        <label htmlFor="direct-mode" className="text-sm cursor-pointer select-none">
                            <span className="block font-medium text-gray-300">Advanced: Direct Connection</span>
                            <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                                Connect the selected folder directly without creating a named subfolder. Use this if you have already selected the specific folder you want to use.
                            </span>
                        </label>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!isDirect && !name.trim()}
                            className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
                        >
                            {isDirect ? 'Connect Folder Directly' : 'Create & Connect'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
