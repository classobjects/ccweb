import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    listSellers: vi.fn(),
    createSeller: vi.fn(),
  },
}))

import { api } from '../api'
import { renderWithProviders } from '../../test/helpers'
import SellerField from './SellerField'

const SELLERS = [
  { id: 5, name: 'coinhound', store_url: 'https://www.ebay.com/usr/coinhound' },
  { id: 6, name: 'example_seller', store_url: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.listSellers.mockResolvedValue(SELLERS)
})

/** The field, with its seller list read, and what it reports. */
async function open(value = '') {
  const onChange = vi.fn()
  renderWithProviders(<SellerField value={value} onChange={onChange} />)
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Seller' })).toHaveTextContent(
      'coinhound',
    ),
  )
  return onChange
}

const address = () => screen.getByRole('textbox', { name: "Seller's store address" })

describe('SellerField: a store address', () => {
  it('chooses the seller whose store it is, however the address is written', async () => {
    const onChange = await open()
    await userEvent.type(address(), 'EBAY.com/usr/coinhound/?_trksid=1{Enter}')

    expect(onChange).toHaveBeenCalledWith('5')
    expect(api.createSeller).not.toHaveBeenCalled()
    expect(screen.getByText('coinhound')).toBeInTheDocument()
  })

  it('chooses the seller of the name the address gives, when no store is on file', async () => {
    const onChange = await open()
    await userEvent.type(address(), 'https://www.ebay.com/usr/Example_Seller')
    await userEvent.tab()

    expect(onChange).toHaveBeenCalledWith('6')
    expect(api.createSeller).not.toHaveBeenCalled()
  })

  it('opens the add form for a store not on file, named as the address names it', async () => {
    api.createSeller.mockResolvedValue({
      id: 9,
      name: 'newhound',
      store_url: 'https://newhound.hibid.com',
    })
    const onChange = await open()
    await userEvent.type(address(), 'newhound.hibid.com{Enter}')

    // Nobody is added yet: the form asks for the contact first.
    expect(api.createSeller).not.toHaveBeenCalled()
    expect(
      screen.getByRole('textbox', { name: 'Store web address or email' }),
    ).toHaveValue('newhound.hibid.com')
    expect(screen.getByRole('textbox', { name: 'Seller name' })).toHaveValue('newhound')
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Contact name' }),
      'Pat Dealer',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add seller' }))

    await waitFor(() =>
      expect(api.createSeller).toHaveBeenCalledWith({
        name: 'newhound',
        store_url: 'https://newhound.hibid.com',
        contact_name: 'Pat Dealer',
      }),
    )
    expect(onChange).toHaveBeenCalledWith('9')
    expect(api.createSeller).toHaveBeenCalledTimes(1)
  })

  it('leaves the form empty again when an address-opened add is cancelled', async () => {
    await open()
    await userEvent.type(address(), 'newhound.hibid.com{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(address()).toHaveValue('')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Seller' }),
      '+ Add a seller...',
    )
    expect(screen.getByRole('textbox', { name: 'Seller name' })).toHaveValue('')
  })

  it('hides the pulldown while an address is typed, and shows it again when cleared', async () => {
    await open()
    await userEvent.type(address(), 'ebay.com/usr/coinhound')
    expect(screen.queryByRole('combobox', { name: 'Seller' })).toBeNull()

    await userEvent.clear(address())
    expect(screen.getByRole('combobox', { name: 'Seller' })).toBeInTheDocument()
  })

  it('says so when the text is not a web address, and adds nobody', async () => {
    const onChange = await open()
    await userEvent.type(address(), 'coin hound{Enter}')

    expect(screen.getByText(/not a web address/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(api.createSeller).not.toHaveBeenCalled()
  })
})

describe('SellerField: adding a seller', () => {
  it('sends the contact typed, the phone as typed after its country code', async () => {
    api.createSeller.mockResolvedValue({ id: 10, name: 'Coin show table 12' })
    const onChange = await open()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Seller' }),
      '+ Add a seller...',
    )
    const phone = screen.getByRole('textbox', { name: 'Contact phone' })
    // The country code is there to type after, not a value already chosen.
    expect(phone).toHaveValue('+1')
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Seller name' }),
      'Coin show table 12',
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Contact email' }),
      'pat@example.com',
    )
    await userEvent.type(phone, ' 860 555 1234')
    await userEvent.click(screen.getByRole('button', { name: 'Add seller' }))

    await waitFor(() =>
      expect(api.createSeller).toHaveBeenCalledWith({
        name: 'Coin show table 12',
        contact_email: 'pat@example.com',
        contact_phone: '+1 860 555 1234',
      }),
    )
    expect(onChange).toHaveBeenCalledWith('10')
  })

  it('sends no contact when none is typed', async () => {
    api.createSeller.mockResolvedValue({ id: 11, name: 'x' })
    await open()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Seller' }),
      '+ Add a seller...',
    )
    await userEvent.type(screen.getByRole('textbox', { name: 'Seller name' }), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Add seller' }))

    await waitFor(() => expect(api.createSeller).toHaveBeenCalledWith({ name: 'x' }))
  })
})
