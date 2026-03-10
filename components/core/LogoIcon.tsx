import React from 'react'

type Props = {
  className?: string
  fill?: string
}

export default function LogoIcon(props: Props) {
  const { className } = props

  return (
    <svg
      width="78"
      height="88"
      viewBox="0 0 78 88"
      className={`visible fill-black sm:hidden ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M77.8812 44.3626C77.8812 68.4628 58.3441 87.9999 34.2439 87.9999L34.2439 88H0.580757V0.72522H34.2439C58.3441 0.72522 77.8812 20.2623 77.8812 44.3626ZM39.1914 31.8748C39.1914 47.0075 29.4413 59.8629 15.8806 64.5017C20.7435 68.9399 27.2139 71.6465 34.3164 71.6465C49.425 71.6465 61.673 59.3986 61.673 44.29C61.673 29.6836 50.2258 17.7509 35.8134 16.9736C37.9785 21.4837 39.1914 26.5376 39.1914 31.8748Z"
      />
    </svg>
  )
}
