package me.rerere.rikkahub.ui.hooks

import org.junit.Assert.assertEquals
import org.junit.Test

class ImeInsetSupportTest {

    @Test
    fun `effective bottom inset falls back to navigation bar when keyboard hidden`() {
        assertEquals(48, effectiveInputBottomInsetPx(imeBottomPx = 0, navigationBarBottomPx = 48))
    }

    @Test
    fun `effective bottom inset prefers keyboard when it is taller than navigation bar`() {
        assertEquals(320, effectiveInputBottomInsetPx(imeBottomPx = 320, navigationBarBottomPx = 48))
    }

    @Test
    fun `ime scroll delta tracks both keyboard show and hide`() {
        assertEquals(200f, imeScrollDeltaPx(previousImeBottomPx = 0, currentImeBottomPx = 200))
        assertEquals(-200f, imeScrollDeltaPx(previousImeBottomPx = 200, currentImeBottomPx = 0))
    }
}
