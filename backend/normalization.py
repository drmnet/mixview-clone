# FILE LOCATION: mixview/backend/normalization.py
# PURPOSE: Centralized music name normalization service for handling variations
#          in artist, album, and track names across different music services

import re
import unicodedata
import difflib
from typing import Optional, List, Tuple
import logging

logger = logging.getLogger(__name__)

class MusicNameNormalizer:
    """
    Handles normalization and fuzzy matching of music entity names.
    Solves common issues like:
    - "The Beatles" vs "Beatles, The" vs "Beatles"
    - "Sgt. Pepper's" vs "Sgt Peppers"
    - Accent variations: "Björk" vs "Bjork"
    - Remaster tags: "Song Name" vs "Song Name (Remastered)"
    """
    
    # Common prefixes that should be ignored in matching
    IGNORE_PREFIXES = ['the ', 'a ', 'an ']
    
    # Common suffixes to strip for better matching
    STRIP_SUFFIXES = [
        '(remastered)', '(remaster)', '[remastered]', '[remaster]',
        '(deluxe edition)', '(deluxe)', '[deluxe edition]', '[deluxe]',
        '(expanded edition)', '(expanded)', '[expanded edition]', '[expanded]',
        '(bonus track version)', '(bonus tracks)', '[bonus tracks]',
        '(anniversary edition)', '[anniversary edition]',
        '(special edition)', '[special edition]',
        '- remastered', '- remaster', '- deluxe', '- expanded',
        '(original motion picture soundtrack)', '(original soundtrack)',
        '(ost)', '[ost]'
    ]
    
    # Words that indicate remasters/versions but shouldn't prevent matching
    VERSION_INDICATORS = [
        'remaster', 'remastered', 'remix', 'remixed', 'deluxe', 'expanded',
        'edition', 'version', 'anniversary', 'special', 'bonus', 'extended'
    ]
    
    @staticmethod
    def normalize(name: str, strict: bool = False) -> str:
        """
        Normalize a music entity name for comparison.
        
        Args:
            name: The name to normalize
            strict: If True, applies more aggressive normalization
        
        Returns:
            Normalized name string
        
        Examples:
            "The Beatles" → "beatles"
            "Björk" → "bjork"
            "Sgt. Pepper's Lonely Hearts Club Band" → "sgt peppers lonely hearts club band"
        """
        if not name:
            return ""
        
        # Convert to lowercase
        normalized = name.lower().strip()
        
        # Remove unicode accents (é → e, ñ → n, ö → o)
        normalized = unicodedata.normalize('NFKD', normalized)
        normalized = normalized.encode('ASCII', 'ignore').decode('ASCII')
        
        # Remove common suffixes (remastered, deluxe, etc.)
        for suffix in MusicNameNormalizer.STRIP_SUFFIXES:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)].strip()
        
        # Remove content in parentheses/brackets if strict mode
        if strict:
            normalized = re.sub(r'\([^)]*\)', '', normalized)
            normalized = re.sub(r'\[[^\]]*\]', '', normalized)
        
        # Remove common prefixes ("The ", "A ", "An ")
        for prefix in MusicNameNormalizer.IGNORE_PREFIXES:
            if normalized.startswith(prefix):
                normalized = normalized[len(prefix):]
                break
        
        # Remove punctuation but keep spaces
        normalized = re.sub(r'[^\w\s]', '', normalized)
        
        # Normalize whitespace (multiple spaces → single space)
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        return normalized
    
    @staticmethod
    def are_similar(name1: str, name2: str, threshold: float = 0.85, 
                    strict: bool = False) -> bool:
        """
        Check if two names are similar enough to be considered the same entity.
        
        Args:
            name1: First name to compare
            name2: Second name to compare
            threshold: Similarity threshold (0.0-1.0), default 0.85
            strict: If True, applies stricter normalization
        
        Returns:
            True if names are similar enough to match
        
        Examples:
            are_similar("The Beatles", "Beatles, The") → True
            are_similar("Abbey Road", "Abbey Rd") → True
            are_similar("Come Together", "Come Together (Remastered)") → True
        """
        if not name1 or not name2:
            return False
        
        # Quick exact match check (case-insensitive)
        if name1.lower() == name2.lower():
            return True
        
        # Normalize both names
        norm1 = MusicNameNormalizer.normalize(name1, strict=strict)
        norm2 = MusicNameNormalizer.normalize(name2, strict=strict)
        
        # Check normalized exact match
        if norm1 == norm2:
            return True
        
        # If either normalized name is empty after normalization, not similar
        if not norm1 or not norm2:
            return False
        
        # Calculate fuzzy similarity ratio
        similarity = difflib.SequenceMatcher(None, norm1, norm2).ratio()
        
        return similarity >= threshold
    
    @staticmethod
    def get_similarity_score(name1: str, name2: str, strict: bool = False) -> float:
        """
        Get the similarity score between two names (0.0 to 1.0).
        
        Args:
            name1: First name to compare
            name2: Second name to compare
            strict: If True, applies stricter normalization
        
        Returns:
            Similarity score from 0.0 (completely different) to 1.0 (identical)
        """
        if not name1 or not name2:
            return 0.0
        
        # Exact match
        if name1.lower() == name2.lower():
            return 1.0
        
        # Normalize and compare
        norm1 = MusicNameNormalizer.normalize(name1, strict=strict)
        norm2 = MusicNameNormalizer.normalize(name2, strict=strict)
        
        if norm1 == norm2:
            return 1.0
        
        if not norm1 or not norm2:
            return 0.0
        
        return difflib.SequenceMatcher(None, norm1, norm2).ratio()
    
    @staticmethod
    def find_best_match(target: str, candidates: List[str], 
                       threshold: float = 0.85) -> Optional[Tuple[str, float]]:
        """
        Find the best matching candidate for a target name.
        
        Args:
            target: The name to match
            candidates: List of candidate names to compare against
            threshold: Minimum similarity threshold
        
        Returns:
            Tuple of (best_match, score) or None if no match above threshold
        
        Example:
            find_best_match("The Beatles", ["Beatles", "Beach Boys", "Bee Gees"])
            → ("Beatles", 1.0)
        """
        if not target or not candidates:
            return None
        
        best_match = None
        best_score = 0.0
        
        for candidate in candidates:
            score = MusicNameNormalizer.get_similarity_score(target, candidate)
            if score > best_score and score >= threshold:
                best_score = score
                best_match = candidate
        
        return (best_match, best_score) if best_match else None
    
    @staticmethod
    def extract_year(text: str) -> Optional[int]:
        """
        Extract a year from text (useful for parsing album titles with years).
        
        Args:
            text: Text that may contain a year
        
        Returns:
            Extracted year as integer, or None
        
        Examples:
            "Abbey Road (1969)" → 1969
            "Greatest Hits 2010" → 2010
        """
        # Match 4-digit years (1900-2099)
        year_pattern = r'\b(19\d{2}|20\d{2})\b'
        matches = re.findall(year_pattern, text)
        
        if matches:
            return int(matches[0])
        
        return None
    
    @staticmethod
    def is_remaster_or_version(name: str) -> bool:
        """
        Check if a name indicates a remaster or special version.
        
        Args:
            name: Name to check
        
        Returns:
            True if name contains remaster/version indicators
        
        Examples:
            "Come Together (Remastered)" → True
            "Abbey Road (Deluxe Edition)" → True
            "Hey Jude" → False
        """
        name_lower = name.lower()
        
        for indicator in MusicNameNormalizer.VERSION_INDICATORS:
            if indicator in name_lower:
                return True
        
        return False
    
    @staticmethod
    def remove_version_info(name: str) -> str:
        """
        Remove version information from a name while keeping the core title.
        
        Args:
            name: Name with potential version info
        
        Returns:
            Name with version info removed
        
        Examples:
            "Come Together (Remastered 2009)" → "Come Together"
            "Abbey Road [Deluxe Edition]" → "Abbey Road"
        """
        # Remove content in parentheses/brackets that contains version indicators
        result = name
        
        # Remove parentheses with version indicators
        result = re.sub(r'\s*\([^)]*(?:' + '|'.join(MusicNameNormalizer.VERSION_INDICATORS) + r')[^)]*\)', '', result, flags=re.IGNORECASE)
        
        # Remove brackets with version indicators
        result = re.sub(r'\s*\[[^\]]*(?:' + '|'.join(MusicNameNormalizer.VERSION_INDICATORS) + r')[^\]]*\]', '', result, flags=re.IGNORECASE)
        
        # Remove trailing dashes/hyphens with version info
        result = re.sub(r'\s*[-–—]\s*(?:' + '|'.join(MusicNameNormalizer.VERSION_INDICATORS) + r').*$', '', result, flags=re.IGNORECASE)
        
        return result.strip()


# Convenience functions for common use cases

def normalize_artist(name: str) -> str:
    """Normalize artist name for comparison."""
    return MusicNameNormalizer.normalize(name, strict=False)

def normalize_album(title: str) -> str:
    """Normalize album title for comparison."""
    return MusicNameNormalizer.normalize(title, strict=False)

def normalize_track(title: str) -> str:
    """Normalize track title for comparison (more lenient with versions)."""
    return MusicNameNormalizer.normalize(title, strict=True)

def artists_match(name1: str, name2: str) -> bool:
    """Check if two artist names match (threshold: 0.90)."""
    return MusicNameNormalizer.are_similar(name1, name2, threshold=0.90)

def albums_match(title1: str, title2: str) -> bool:
    """Check if two album titles match (threshold: 0.88)."""
    return MusicNameNormalizer.are_similar(title1, title2, threshold=0.88)

def tracks_match(title1: str, title2: str, allow_versions: bool = True) -> bool:
    """
    Check if two track titles match (threshold: 0.85).
    
    Args:
        title1: First track title
        title2: Second track title
        allow_versions: If True, treats "Song" and "Song (Remastered)" as same
    
    Returns:
        True if tracks match
    """
    if allow_versions:
        # Remove version info before comparing
        title1_clean = MusicNameNormalizer.remove_version_info(title1)
        title2_clean = MusicNameNormalizer.remove_version_info(title2)
        return MusicNameNormalizer.are_similar(title1_clean, title2_clean, threshold=0.85, strict=True)
    else:
        return MusicNameNormalizer.are_similar(title1, title2, threshold=0.85, strict=True)


# Logging helper for debugging normalization
def log_normalization_comparison(name1: str, name2: str, entity_type: str = "name"):
    """Helper function to log normalization comparisons for debugging."""
    norm1 = MusicNameNormalizer.normalize(name1)
    norm2 = MusicNameNormalizer.normalize(name2)
    score = MusicNameNormalizer.get_similarity_score(name1, name2)
    match = MusicNameNormalizer.are_similar(name1, name2)
    
    logger.debug(f"Normalization comparison for {entity_type}:")
    logger.debug(f"  Original 1: '{name1}' → Normalized: '{norm1}'")
    logger.debug(f"  Original 2: '{name2}' → Normalized: '{norm2}'")
    logger.debug(f"  Similarity: {score:.3f} | Match: {match}")